const fs = require('node:fs');
const { atomicWrite, buildDashboard } = require('./service');

const SCHEMA = 'gamebuddy.review-history.v2';
const LIMIT = 100;

function emptyHistory() {
  return { schema: SCHEMA, updatedAt: Date.now(), runs: [], recoveryWarning: null };
}

function load(filePath) {
  if (!fs.existsSync(filePath)) return emptyHistory();
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (value?.schema !== SCHEMA || !Array.isArray(value.runs)) throw new Error('unsupported fact review history');
    return { ...emptyHistory(), ...value, runs: value.runs.slice(0, LIMIT) };
  } catch (error) {
    return { ...emptyHistory(), recoveryWarning: `事实摘要读取失败：${error.message}` };
  }
}

function emptyCounters() {
  return {
    combats: 0, normalCombats: 0, eliteEntries: 0, eliteWins: 0, bossEntries: 0,
    typedCardsPlayed: 0, attacksPlayed: 0,
    cardRewards: 0, cardsTaken: 0, rewardSkips: 0, unknownRewards: 0,
    shopsVisited: 0, knownGoldSpent: 0, unknownShopClosures: 0,
    restSites: 0, smiths: 0, heals: 0, otherKnownRestActions: 0, unknownRestActions: 0
  };
}

function number(value) {
  return Number.isFinite(value) ? value : null;
}

function encounterLabel(payload) {
  const enemies = Array.isArray(payload?.enemies)
    ? payload.enemies.map(enemy => enemy?.name).filter(Boolean)
    : [];
  if (enemies.length) return enemies.join('、');
  return payload?.bossName || payload?.encounterName || null;
}

function wholeRunFloor(observations) {
  const explicit = [...observations].reverse().find(fact => number(fact.payload?.totalFloor) !== null);
  if (explicit) return number(explicit.payload.totalFloor);
  const segments = [];
  for (const fact of observations) {
    const act = number(fact.payload?.act);
    const floor = number(fact.payload?.floor);
    if (act === null || floor === null) continue;
    const current = segments.at(-1);
    if (!current || current.act !== act) segments.push({ act, floors: [floor] });
    else current.floors.push(floor);
  }
  if (!segments.length) return null;
  return segments.reduce((total, segment, index) => {
    const positive = segment.floors.filter(floor => floor > 0);
    if (!positive.length) return total;
    let highest = Math.max(...positive);
    const completedAct = index < segments.length - 1;
    if (completedAct && positive.includes(highest - 1)) highest -= 1;
    return total + highest;
  }, 0);
}

function summarize(runId, facts, coverage) {
  const ended = [...facts].reverse().find(fact => fact.eventType === 'run.ended');
  if (!ended || typeof ended.payload?.cleared !== 'boolean') return null;
  const observations = facts.filter(fact => fact.eventType === 'run.observed');
  const first = observations[0]?.payload || {};
  const last = observations.at(-1)?.payload || first;
  const counters = emptyCounters();
  const combats = new Map();
  const rewards = new Map();
  const shops = new Set();
  const rests = new Set();
  const turnDamage = new Map();
  let currentTurn = new Map();
  let maxTurnDamage = 0;
  let finalBossId = null;
  let finalBossName = null;
  let finalEncounterKind = null;
  const openCombats = new Map();

  for (const fact of facts) {
    const payload = fact.payload || {};
    const attemptKey = fact.combatId ? `${fact.combatId}:${fact.attemptGeneration ?? 0}` : null;
    if (fact.eventType === 'combat.started' && attemptKey) {
      const prior = combats.get(fact.combatId) || {};
      const roomType = String(payload.roomType || payload.nodeType || prior.roomType || '').toLowerCase();
      const combat = { ...prior, ...payload, roomType, occurredAt: fact.occurredAt, sourceSeq: fact.sourceSeq };
      combats.set(fact.combatId, combat);
      openCombats.set(attemptKey, combat);
      if (roomType.includes('boss') || payload.boss === true) {
        finalBossId = payload.bossId || payload.encounterId || finalBossId;
        finalBossName = payload.bossName || payload.encounterName || encounterLabel(payload) || finalBossName;
      }
    }
    if (fact.eventType === 'combat.ended' && attemptKey) {
      combats.set(fact.combatId, { ...(combats.get(fact.combatId) || {}), victory: payload.victory });
      openCombats.delete(attemptKey);
    }
    if (fact.eventType === 'combat.attempt_replaced' && fact.combatId) {
      for (const key of [...openCombats.keys()]) {
        if (key.startsWith(`${fact.combatId}:`)) openCombats.delete(key);
      }
    }
    if (fact.eventType === 'turn.started' && fact.combatId) {
      currentTurn.set(fact.combatId, `${fact.attemptGeneration}:${payload.turn ?? payload.round ?? fact.eventId}`);
    }
    if (fact.eventType === 'damage.resolved' && fact.combatId) {
      const turn = currentTurn.get(fact.combatId) || `${fact.attemptGeneration}:unknown`;
      const key = `${fact.combatId}:${turn}`;
      const damage = Math.max(0, number(payload.hpLoss) || 0);
      turnDamage.set(key, (turnDamage.get(key) || 0) + damage);
      maxTurnDamage = Math.max(maxTurnDamage, turnDamage.get(key));
    }
    if (fact.eventType === 'card.played') {
      if (payload.cardType) counters.typedCardsPlayed += 1;
      if (String(payload.cardType || '').toLowerCase() === 'attack') counters.attacksPlayed += 1;
    }
    if (fact.eventType === 'reward.offered' && fact.decisionId) rewards.set(fact.decisionId, 'offered');
    if (fact.eventType === 'reward.resolved' && fact.decisionId) {
      rewards.set(fact.decisionId, payload.result || 'unknown');
    }
    if (fact.eventType === 'shop.opened') shops.add(fact.decisionId || fact.eventId);
    if (fact.eventType === 'shop.transaction_completed') {
      counters.knownGoldSpent += Math.max(0, number(payload.price) || 0);
    }
    if (fact.eventType === 'rest.options_offered') rests.add(fact.decisionId || fact.eventId);
    if (fact.eventType === 'rest.action_completed') {
      const action = String(payload.action || '').toLowerCase();
      if (action === 'smith') counters.smiths += 1;
      else if (action === 'heal') counters.heals += 1;
      else counters.otherKnownRestActions += 1;
    }
  }

  counters.combats = combats.size;
  for (const combat of combats.values()) {
    const roomType = String(combat.roomType || '').toLowerCase();
    if (roomType.includes('elite')) {
      counters.eliteEntries += 1;
      if (combat.victory === true) counters.eliteWins += 1;
    } else if (roomType.includes('boss') || combat.boss === true) counters.bossEntries += 1;
    else counters.normalCombats += 1;
  }
  counters.cardRewards = rewards.size;
  for (const result of rewards.values()) {
    if (result === 'selected') counters.cardsTaken += 1;
    else if (result === 'skipped') counters.rewardSkips += 1;
    else counters.unknownRewards += 1;
  }
  counters.shopsVisited = shops.size;
  counters.restSites = rests.size;
  const died = ended.payload.cleared === false && ended.payload.reason !== 'abandoned';
  if (died) {
    const killer = [...openCombats.values()].sort((left, right) => (
      (left.occurredAt || 0) - (right.occurredAt || 0) || (left.sourceSeq || 0) - (right.sourceSeq || 0)
    )).at(-1);
    finalBossId = killer ? killer.bossId || killer.encounterId || killer.enemies?.[0]?.id || null : null;
    finalBossName = killer ? encounterLabel(killer) : null;
    finalEncounterKind = killer ? 'killer' : null;
  } else if (finalBossName) {
    finalEncounterKind = 'boss';
  }
  const cardCoverage = coverage?.families?.card_play?.state;
  if (cardCoverage !== 'available') {
    counters.typedCardsPlayed = 0;
    counters.attacksPlayed = 0;
  }

  return {
    runId,
    character: last.character || first.character || 'unknown',
    ascension: number(last.ascension ?? first.ascension),
    startedAt: number(facts.find(fact => fact.eventType === 'run.started' || fact.eventType === 'run.resumed')?.occurredAt),
    endedAt: number(ended.occurredAt),
    result: ended.payload.cleared ? 'win' : 'loss',
    finalAct: number(last.act),
    finalFloor: wholeRunFloor(observations),
    finalBossId,
    finalBossName,
    finalEncounterKind,
    maxTurnDamage: coverage?.families?.combat_resolution?.state === 'available' ? maxTurnDamage : null,
    initialDeckSize: Array.isArray(first.deck) ? first.deck.length : null,
    finalState: {
      hp: number(last.hp),
      maxHp: number(last.maxHp),
      gold: number(last.gold),
      deck: Array.isArray(last.deck) ? last.deck : [],
      deckSize: Array.isArray(last.deck) ? last.deck.length : null,
      relics: Array.isArray(last.relics) ? last.relics : [],
      potions: Array.isArray(last.potions) ? last.potions : []
    },
    counters,
    coverage: coverage?.families || {}
  };
}

function createFactReviewService({ filePath }) {
  if (!filePath) throw new Error('fact review filePath is required');
  let history = load(filePath);

  function save() {
    history.updatedAt = Date.now();
    atomicWrite(filePath, history);
  }

  return {
    ingestRun(runId, facts, coverage) {
      const summary = summarize(runId, facts, coverage);
      history.runs = history.runs.filter(run => run.runId !== runId);
      if (summary) history.runs.unshift(summary);
      history.runs.sort((left, right) => (right.endedAt || 0) - (left.endedAt || 0));
      history.runs = history.runs.slice(0, LIMIT);
      save();
      return summary;
    },
    getDashboard: () => ({ ...buildDashboard(history), schema: 'gamebuddy.review-dashboard.v2' }),
    getHistory: () => JSON.parse(JSON.stringify(history)),
    exportData: () => JSON.parse(JSON.stringify(history)),
    clear: () => {
      history = emptyHistory();
      save();
      return { ...buildDashboard(history), schema: 'gamebuddy.review-dashboard.v2' };
    },
    flush: save
  };
}

module.exports = {
  SCHEMA,
  createFactReviewService,
  summarize
};
