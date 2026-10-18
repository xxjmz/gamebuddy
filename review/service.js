const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = 'gamebuddy.review-history.v1';
const HISTORY_LIMIT = 100;
const DASHBOARD_LIMIT = 50;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const number = value => Number.isFinite(value) ? value : null;
const ratio = (numerator, denominator, unknown = 0) => ({
  value: denominator > 0 ? Math.round((1000 * numerator) / denominator) / 10 : null,
  numerator,
  denominator,
  unknown
});

function emptyCounters() {
  return {
    combats: 0, normalCombats: 0, eliteEntries: 0, eliteWins: 0, bossEntries: 0,
    typedCardsPlayed: 0, attacksPlayed: 0,
    cardRewards: 0, cardsTaken: 0, rewardSkips: 0, unknownRewards: 0,
    shopsVisited: 0, knownGoldSpent: 0, unknownShopClosures: 0,
    restSites: 0, smiths: 0, heals: 0, otherKnownRestActions: 0, unknownRestActions: 0
  };
}

function emptyHistory() {
  return { schema: SCHEMA, updatedAt: Date.now(), active: null, runs: [], recoveryWarning: null };
}

function normalizeHistory(value) {
  if (!value || value.schema !== SCHEMA || !Array.isArray(value.runs)) throw new Error('unsupported review history');
  return {
    schema: SCHEMA,
    updatedAt: number(value.updatedAt) || Date.now(),
    active: value.active && typeof value.active === 'object' ? value.active : null,
    runs: value.runs.filter(run => run && typeof run === 'object').slice(0, HISTORY_LIMIT),
    recoveryWarning: typeof value.recoveryWarning === 'string' ? value.recoveryWarning : null
  };
}

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  const backupPath = `${filePath}.bak`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = fs.openSync(temporaryPath, 'w');
  try {
    fs.writeFileSync(descriptor, payload, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
  fs.renameSync(temporaryPath, filePath);
}

function loadHistory(filePath) {
  if (!fs.existsSync(filePath)) return emptyHistory();
  try {
    return normalizeHistory(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch (primaryError) {
    const backupPath = `${filePath}.bak`;
    if (fs.existsSync(backupPath)) {
      try {
        const recovered = normalizeHistory(JSON.parse(fs.readFileSync(backupPath, 'utf8')));
        recovered.recoveryWarning = '主记录损坏，已从本机备份恢复。';
        return recovered;
      } catch {
        // Preserve both files for diagnosis and surface the recovery failure.
      }
    }
    return { ...emptyHistory(), recoveryWarning: `复盘记录读取失败：${primaryError.message}` };
  }
}

function stateRunId(state, active) {
  const explicit = state?.run?.runId || state?.run?.id || state?.run?.seedHash || state?.run?.seed;
  if (explicit) return String(explicit);
  if (active && active.character === state?.run?.character) return active.runId;
  return `legacy-${String(state?.run?.character || 'unknown')}-${Date.now()}`;
}

function beginDraft(state, runId) {
  return {
    runId,
    character: state?.run?.character || 'unknown',
    ascension: number(state?.run?.ascension),
    startedAt: number(state?.run?.startedAt) || number(state?.timestamp) || Date.now(),
    updatedAt: Date.now(),
    initialDeckSize: Array.isArray(state?.player?.cards) ? state.player.cards.length : null,
    finalAct: number(state?.run?.act),
    finalFloor: number(state?.run?.totalFloor) ?? number(state?.run?.floor),
    finalBossId: state?.run?.nextBossId || null,
    finalBossName: state?.run?.nextBoss || null,
    maxTurnDamage: number(state?.run?.maxTurnDamage),
    currentTurnDamage: 0,
    lastCombatTurn: null,
    lastEnemyHp: null,
    counters: emptyCounters(),
    finalState: null,
    result: null
  };
}

function updateDamage(draft, state) {
  if (!state?.combat || !Array.isArray(state.combat.enemies)) {
    draft.lastEnemyHp = null;
    draft.lastCombatTurn = null;
    draft.currentTurnDamage = 0;
    return;
  }
  const turn = number(state.combat.turn);
  const enemyHp = state.combat.enemies.reduce((sum, enemy) => sum + Math.max(0, number(enemy?.hp) || 0), 0);
  if (turn !== draft.lastCombatTurn) draft.currentTurnDamage = 0;
  else if (draft.lastEnemyHp !== null && enemyHp < draft.lastEnemyHp) {
    draft.currentTurnDamage += draft.lastEnemyHp - enemyHp;
    draft.maxTurnDamage = Math.max(draft.maxTurnDamage || 0, draft.currentTurnDamage);
  }
  draft.lastCombatTurn = turn;
  draft.lastEnemyHp = enemyHp;
}

function updateDraftFromState(draft, state) {
  draft.updatedAt = Date.now();
  draft.character = state?.run?.character || draft.character;
  draft.finalAct = number(state?.run?.act) ?? draft.finalAct;
  draft.finalFloor = number(state?.run?.totalFloor) ?? number(state?.run?.floor) ?? draft.finalFloor;
  draft.finalBossId = state?.run?.finalBossId || state?.run?.nextBossId || draft.finalBossId;
  draft.finalBossName = state?.run?.finalBossName || state?.run?.nextBoss || draft.finalBossName;
  draft.maxTurnDamage = number(state?.run?.maxTurnDamage) ?? draft.maxTurnDamage;
  if (draft.initialDeckSize === null && Array.isArray(state?.player?.cards)) {
    draft.initialDeckSize = state.player.cards.length;
  }
  draft.finalState = {
    hp: number(state?.player?.hp),
    maxHp: number(state?.player?.maxHp),
    gold: number(state?.player?.gold),
    deck: Array.isArray(state?.player?.cards) ? state.player.cards : [],
    relics: Array.isArray(state?.player?.relics) ? state.player.relics : [],
    potions: Array.isArray(state?.player?.potions) ? state.player.potions : [],
    deckSize: Array.isArray(state?.player?.cards) ? state.player.cards.length : null
  };
  updateDamage(draft, state);
}

function finishDraft(draft, result, data = {}) {
  return {
    ...draft,
    result,
    endedAt: number(data.endedAt) || Date.now(),
    playtimeSeconds: number(data.playtimeSeconds),
    finalAct: number(data.act) ?? draft.finalAct,
    finalFloor: number(data.floor) ?? draft.finalFloor,
    finalBossId: data.bossId || draft.finalBossId || null,
    finalBossName: data.bossName || draft.finalBossName || null,
    maxTurnDamage: number(data.maxTurnDamage) ?? draft.maxTurnDamage ?? null
  };
}

function applyEvent(draft, event) {
  const data = event?.data || {};
  const counters = draft.counters;
  switch (event?.name) {
    case 'combat.started': {
      counters.combats += 1;
      const roomType = String(data.roomType || data.nodeType || '').toLowerCase();
      if (roomType.includes('elite')) counters.eliteEntries += 1;
      else if (roomType.includes('boss')) {
        counters.bossEntries += 1;
        draft.finalBossId = data.bossId || data.encounterId || draft.finalBossId;
        draft.finalBossName = data.bossName || data.encounterName || draft.finalBossName;
      } else counters.normalCombats += 1;
      break;
    }
    case 'combat.ended':
      if (data.victory === true && String(data.roomType || '').toLowerCase().includes('elite')) counters.eliteWins += 1;
      break;
    case 'card.played':
      if (data.cardType) counters.typedCardsPlayed += 1;
      if (String(data.cardType || '').toLowerCase() === 'attack') counters.attacksPlayed += 1;
      break;
    case 'card.reward.opened': counters.cardRewards += 1; break;
    case 'card.reward.selected': counters.cardsTaken += 1; break;
    case 'card.reward.closed':
      if (data.outcome === 'skipped' || data.skipped === true) counters.rewardSkips += 1;
      else if (data.outcome === 'unknown') counters.unknownRewards += 1;
      break;
    case 'shop.opened': counters.shopsVisited += 1; break;
    case 'shop.closed':
      if (Number.isFinite(data.goldSpent)) counters.knownGoldSpent += Math.max(0, data.goldSpent);
      else counters.unknownShopClosures += 1;
      break;
    case 'rest.opened': counters.restSites += 1; break;
    case 'rest.closed': {
      const action = String(data.action || '').toUpperCase();
      if (action === 'SMITH') counters.smiths += 1;
      else if (action === 'HEAL') counters.heals += 1;
      else if (action && action !== 'UNKNOWN') counters.otherKnownRestActions += 1;
      else counters.unknownRestActions += 1;
      break;
    }
  }
}

function createReviewService({ filePath, checkpointMs = 5000 } = {}) {
  if (!filePath) throw new Error('review filePath is required');
  let history = loadHistory(filePath);
  let lastWrite = 0;

  function save(force = false) {
    const now = Date.now();
    if (!force && now - lastWrite < checkpointMs) return;
    history.updatedAt = now;
    atomicWrite(filePath, history);
    lastWrite = now;
  }

  function archive(result, data = {}) {
    if (!history.active) return null;
    const completed = finishDraft(history.active, result, data);
    history.runs = [completed, ...history.runs.filter(run => run.runId !== completed.runId)].slice(0, HISTORY_LIMIT);
    history.active = null;
    save(true);
    return completed;
  }

  function ingestState(state) {
    if (!state?.run || !state?.player) return null;
    const explicitRunId = state?.run?.runId || state?.run?.id || state?.run?.seedHash || state?.run?.seed;
    const currentFloor = number(state?.run?.totalFloor) ?? number(state?.run?.floor);
    const legacyRestart = !explicitRunId && history.active && currentFloor !== null
      && currentFloor <= 1 && number(history.active.finalFloor) > 1;
    const runId = legacyRestart ? `legacy-${String(state.run.character || 'unknown')}-${Date.now()}` : stateRunId(state, history.active);
    if (history.active && history.active.runId !== runId) archive('abandoned');
    if (!history.active) history.active = beginDraft(state, runId);
    updateDraftFromState(history.active, state);
    save(false);
    return history.active;
  }

  function ingestEvent(event) {
    if (event?.name === 'run.started') {
      const runId = String(event.data?.runId || '');
      if (history.active && history.active.runId !== runId) archive('abandoned');
      if (!history.active && runId) history.active = beginDraft({ run: event.data, player: {} }, runId);
    }
    if (!history.active) return null;
    applyEvent(history.active, event);
    if (event?.name === 'run.ended') {
      if (event.data?.runId && String(event.data.runId) !== history.active.runId) return null;
      return archive(event.data?.result || 'loss', event.data);
    }
    save(false);
    return history.active;
  }

  return {
    ingestState,
    ingestEvent,
    archive,
    getDashboard: () => buildDashboard(history),
    getHistory: () => JSON.parse(JSON.stringify(history)),
    exportData: () => ({ ...history, active: history.active ? { ...history.active } : null }),
    clear: () => {
      history = emptyHistory();
      save(true);
      return buildDashboard(history);
    },
    flush: () => save(true)
  };
}

function sum(runs, key) {
  return runs.reduce((total, run) => total + (number(run?.counters?.[key]) || 0), 0);
}

function mainCharacter(runs) {
  const counts = new Map();
  for (const run of runs) counts.set(run.character, (counts.get(run.character) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || runs.findIndex(run => run.character === a[0]) - runs.findIndex(run => run.character === b[0]))[0]?.[0] || null;
}

function buildAxes(runs) {
  const typed = sum(runs, 'typedCardsPlayed');
  const attacks = sum(runs, 'attacksPlayed');
  const skips = sum(runs, 'rewardSkips');
  const taken = sum(runs, 'cardsTaken');
  const elite = sum(runs, 'eliteEntries');
  const normal = sum(runs, 'normalCombats');
  const shops = sum(runs, 'shopsVisited');
  const spent = sum(runs, 'knownGoldSpent');
  const finalGoldRuns = runs.filter(run => number(run?.finalState?.gold) !== null);
  const finalGold = finalGoldRuns.reduce((total, run) => total + run.finalState.gold, 0);
  const actsReached = runs.reduce((total, run) => total + Math.max(1, number(run.finalAct) || 1), 0);
  const smiths = sum(runs, 'smiths');
  const heals = sum(runs, 'heals');
  const otherRest = sum(runs, 'otherKnownRestActions');
  const rewardUnknown = sum(runs, 'unknownRewards');
  const knownRewards = skips + taken;
  const deckRuns = runs.filter(run => number(run.initialDeckSize) !== null && number(run?.finalState?.deckSize) !== null);
  const growth = deckRuns.reduce((total, run) => total + Math.max(0, run.finalState.deckSize - run.initialDeckSize), 0);
  const compactness = deckRuns.length ? clamp(1 - (growth / deckRuns.length) / 25) : null;
  const skipRate = knownRewards ? skips / knownRewards : null;
  const restraintParts = [skipRate === null ? null : { value: skipRate, weight: 0.6 }, compactness === null ? null : { value: compactness, weight: 0.4 }].filter(Boolean);
  const restraint = restraintParts.length ? 100 * restraintParts.reduce((total, part) => total + part.value * part.weight, 0) / restraintParts.reduce((total, part) => total + part.weight, 0) : null;
  const shopParts = [];
  if (actsReached > 0) shopParts.push({ value: clamp(shops / actsReached), weight: 0.5 });
  if (finalGoldRuns.length && spent + finalGold > 0) shopParts.push({ value: spent / (spent + finalGold), weight: 0.5 });
  const shopValue = shopParts.length ? 100 * shopParts.reduce((total, part) => total + part.value * part.weight, 0) / shopParts.reduce((total, part) => total + part.weight, 0) : null;
  return [
    { id: 'attackPlay', label: '进攻出牌', ...ratio(attacks, typed) },
    { id: 'cardRestraint', label: '拿牌克制', value: restraint === null ? null : Math.round(restraint * 10) / 10, numerator: skips, denominator: knownRewards, unknown: rewardUnknown },
    { id: 'eliteChallenge', label: '精英挑战', value: elite + normal ? Math.round(1000 * clamp((elite / (elite + normal)) / 0.3)) / 10 : null, numerator: elite, denominator: elite + normal, unknown: 0 },
    { id: 'shopSpending', label: '商店消费', value: shopValue === null ? null : Math.round(shopValue * 10) / 10, numerator: spent, denominator: spent + finalGold, unknown: sum(runs, 'unknownShopClosures') },
    { id: 'campUpgrade', label: '火堆升级', ...ratio(smiths, smiths + heals + otherRest, sum(runs, 'unknownRestActions')) }
  ];
}

function buildStats(runs) {
  const wins = runs.filter(run => run.result === 'win').length;
  const losses = runs.filter(run => run.result === 'loss').length;
  const completed = wins + losses;
  const progressRuns = runs.filter(run => number(run.finalFloor) !== null);
  const progressTotal = progressRuns.reduce((total, run) => total + (run.result === 'win' ? 100 : clamp((run.finalFloor || 0) / 55) * 100), 0);
  const deckRuns = runs.filter(run => number(run?.finalState?.deckSize) !== null);
  const compactDecks = deckRuns.filter(run => run.finalState.deckSize <= 20).length;
  const eliteRuns = runs.filter(run => (run.counters?.eliteEntries || 0) > 0).length;
  const smiths = sum(runs, 'smiths');
  const restKnown = smiths + sum(runs, 'heals') + sum(runs, 'otherKnownRestActions');
  return [
    { id: 'winRate', label: '通关率', ...ratio(wins, completed) },
    { id: 'progress', label: '平均进度', value: progressRuns.length ? Math.round(progressTotal / progressRuns.length) : null, numerator: progressRuns.length, denominator: progressRuns.length },
    { id: 'compactDeck', label: '20张内牌组', ...ratio(compactDecks, deckRuns.length) },
    { id: 'eliteRun', label: '精英挑战', ...ratio(eliteRuns, runs.length) },
    { id: 'campUpgrade', label: '火堆升级', ...ratio(smiths, restKnown, sum(runs, 'unknownRestActions')) }
  ];
}

function displayText(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value);
}

function projectCard(card) {
  if (typeof card === 'string') return { id: card, name: card, upgraded: false };
  if (!card || typeof card !== 'object') return { id: '', name: '', upgraded: false };
  const id = displayText(card.id ?? card.Id);
  const name = displayText(card.name ?? card.Name ?? card.title ?? card.Title) || id;
  return {
    id,
    name,
    upgraded: Boolean(card.upgraded || card.IsUpgraded || card.Upgraded)
  };
}

function projectRelic(relic) {
  if (typeof relic === 'string') return { id: relic, name: relic };
  if (!relic || typeof relic !== 'object') return { id: '', name: '' };
  const id = displayText(relic.id ?? relic.Id);
  return {
    id,
    name: displayText(relic.name ?? relic.Name ?? relic.title ?? relic.Title) || id
  };
}

function projectBuildList(value, project) {
  if (!Array.isArray(value)) return null;
  return value.map(project);
}

function projectRunBuild(run) {
  const finalState = run?.finalState;
  if (!finalState || typeof finalState !== 'object' || Array.isArray(finalState)) {
    return { deck: null, relics: null };
  }
  return {
    deck: projectBuildList(finalState.deck, projectCard),
    relics: projectBuildList(finalState.relics, projectRelic)
  };
}

function buildDashboard(history) {
  const all = history.runs.slice(0, DASHBOARD_LIMIT);
  const character = mainCharacter(all);
  const runs = character ? all.filter(run => run.character === character).slice(0, DASHBOARD_LIMIT) : [];
  const wins = all.filter(run => run.result === 'win').length;
  const losses = all.filter(run => run.result === 'loss').length;
  return {
    schema: 'gamebuddy.review-dashboard.v1',
    mainCharacter: character,
    sampleSize: runs.length,
    window: {
      total: all.length,
      wins,
      losses,
      abandoned: all.filter(run => run.result === 'abandoned').length
    },
    axes: buildAxes(runs),
    stats: buildStats(runs),
    recentRuns: all.map(run => ({
      runId: run.runId,
      character: run.character,
      result: run.result,
      bossId: run.finalBossId || null,
      bossName: run.finalBossName || null,
      floor: number(run.finalFloor),
      maxTurnDamage: number(run.maxTurnDamage),
      endedAt: number(run.endedAt),
      ...projectRunBuild(run)
    })),
    recoveryWarning: history.recoveryWarning || null
  };
}

module.exports = {
  SCHEMA,
  atomicWrite,
  buildDashboard,
  createReviewService,
  emptyHistory,
  loadHistory
};
