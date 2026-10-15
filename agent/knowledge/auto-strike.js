const cards = require('../data/codex/cards.json');
const { normalizeKey, inferUpgraded } = require('./spire-codex');

const CARD_IDS = new Map();
for (const card of cards) {
  const id = normalizeKey(card.id);
  if (!id) continue;
  CARD_IDS.set(id, card.id);
  const name = normalizeKey(card.name);
  if (name && !CARD_IDS.has(name)) CARD_IDS.set(name, card.id);
}

const RELIC_IDS = new Map([
  ['STRIKE_DUMMY', '打击木偶'],
  ['ORNAMENTAL_FAN', '精致折扇'],
  ['VERY_HOT_COCOA', '烫嘴可可'],
  ['BAG_OF_PREPARATION', '准备背包'],
  ['ROYAL_STAMP', '王室印章']
].flatMap(([id, name]) => [[normalizeKey(id), id], [normalizeKey(name), id]]));

/** S/A/B support: rate is per-copy miss factor for saturation. */
const SUPPORT_RATES = {
  OFFERING: 0.32,
  BURNING_PACT: 0.28,
  SHRUG_IT_OFF: 0.18,
  HEADBUTT: 0.16,
  DRUM_OF_BATTLE: 0.16,
  JUGGLING: 0.18,
  BLOODLETTING: 0.12,
  BATTLE_TRANCE: 0.08,
  STOKE: 0.1,
  SECOND_WIND: 0.06
};

const CONDITIONAL_SUPPORT = {
  RAGE: { rate: 0.1, needsCore: true },
  DARK_EMBRACE: { rate: 0.1, needsExhaustPackage: true }
};

/** Strike-named ammo weights; only score when Hellraiser is present. */
const AMMO_WEIGHTS = {
  STRIKE_IRONCLAD: 1.2,
  TWIN_STRIKE: 2.4,
  SETUP_STRIKE: 2.4,
  ASHEN_STRIKE: 1.0
};

const POISON_WEIGHTS = {
  PRIMAL_FORCE: 18,
  FIEND_FIRE: 15,
  DEMON_FORM: 14,
  CORRUPTION: 13,
  SEVERANCE: 12,
  BRAND: 11,
  HAVOC: 10
};

const ANTI_WEIGHTS = {
  INFLAME: 7,
  RUPTURE: 7,
  FEED: 6,
  WHIRLWIND: 6,
  RAMPAGE: 6,
  ANGER: 5,
  BARRICADE: 5,
  PACTS_END: 5,
  INFERNAL_BLADE: 5
};

const EXHAUST_PACKAGE_IDS = new Set(['BURNING_PACT', 'STOKE', 'DARK_EMBRACE']);

function cardId(card) {
  const id = CARD_IDS.get(normalizeKey(card?.id || card));
  return id || CARD_IDS.get(normalizeKey(card?.name)) || null;
}

function relicId(relic) {
  return RELIC_IDS.get(normalizeKey(relic?.id || relic))
    || RELIC_IDS.get(normalizeKey(relic?.name))
    || null;
}

function isIronclad(character) {
  return ['IRONCLAD', '铁甲战士'].includes(normalizeKey(character));
}

function noCopiesInDraw(deckSize, copies, draws) {
  if (copies <= 0) return 1;
  if (draws > deckSize - copies) return 0;
  let probability = 1;
  for (let index = 0; index < draws; index += 1) {
    probability *= (deckSize - copies - index) / (deckSize - index);
  }
  return probability;
}

function setupProbability(deckSize, coreCount, loopCount, extraDraw) {
  if (!coreCount || !loopCount || !deckSize) return 0;
  const draws = Math.min(deckSize, 10 + extraDraw);
  const probability = 1
    - noCopiesInDraw(deckSize, coreCount, draws)
    - noCopiesInDraw(deckSize, loopCount, draws)
    + noCopiesInDraw(deckSize, coreCount + loopCount, draws);
  return Math.max(0, Math.min(1, probability));
}

function stackPenalty(copies, weight) {
  if (copies <= 0 || weight <= 0) return 0;
  let total = 0;
  const steps = Math.min(copies, 4);
  for (let index = 0; index < steps; index += 1) {
    total += weight * Math.pow(0.55, index);
  }
  if (copies > 4) total += weight * Math.pow(0.55, 4) * (copies - 4) * 0.35;
  return total;
}

function deckCounts(deck) {
  const counts = new Map();
  const effectiveCounts = new Map();
  for (const card of deck || []) {
    const id = cardId(card);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
    effectiveCounts.set(id, (effectiveCounts.get(id) || 0) + (inferUpgraded(card) ? 1.35 : 1));
  }
  return {
    count: id => counts.get(id) || 0,
    effective: id => effectiveCounts.get(id) || 0,
    size: (deck || []).length
  };
}

function supportValue(effective, coreActive) {
  let miss = 1;
  for (const [id, rate] of Object.entries(SUPPORT_RATES)) {
    miss *= Math.pow(1 - rate, effective(id));
  }
  const hasExhaust = [...EXHAUST_PACKAGE_IDS].some(id => effective(id) > 0);
  for (const [id, rule] of Object.entries(CONDITIONAL_SUPPORT)) {
    const allowed = (rule.needsCore ? coreActive : true)
      && (rule.needsExhaustPackage ? hasExhaust : true);
    if (!allowed) continue;
    miss *= Math.pow(1 - rule.rate, effective(id));
  }
  return (1 - miss) * (coreActive ? 1 : 0.35);
}

function ammoStructure(effective, coreActive) {
  if (!coreActive) return 0;
  let total = 0;
  for (const [id, weight] of Object.entries(AMMO_WEIGHTS)) {
    total += stackPenalty(effective(id), weight);
  }
  return Math.min(total, 9);
}

function antiPoisonPenalty(effective) {
  let anti = 0;
  let poison = 0;
  for (const [id, weight] of Object.entries(ANTI_WEIGHTS)) {
    anti += stackPenalty(effective(id), weight);
  }
  for (const [id, weight] of Object.entries(POISON_WEIGHTS)) {
    poison += stackPenalty(effective(id), weight);
  }
  return { anti, poison };
}

function autoStrikeScore(deck, relics = []) {
  const { count, effective, size } = deckCounts(deck);
  const coreCount = count('HELLRAISER');
  const coreActive = coreCount > 0;
  const core = coreActive ? (effective('HELLRAISER') > coreCount ? 1.05 : 1) : 0;
  const loop = 1 - Math.pow(0.45, effective('POMMEL_STRIKE'))
    * Math.pow(0.65, effective('PILLAGE'));
  const output = 1 - Math.pow(0.5, effective('PERFECTED_STRIKE'));
  const support = supportValue(effective, coreActive);
  const ammo = ammoStructure(effective, coreActive);
  const { anti, poison } = antiPoisonPenalty(effective);

  const relicSet = new Set((relics || []).map(relicId).filter(Boolean));
  let relicMiss = 1;
  for (const id of relicSet) {
    const rate = {
      STRIKE_DUMMY: 0.45,
      ORNAMENTAL_FAN: 0.2,
      VERY_HOT_COCOA: 0.1,
      BAG_OF_PREPARATION: 0.15,
      ROYAL_STAMP: 0.2
    }[id] || 0;
    relicMiss *= 1 - rate;
  }
  const relicSupport = 1 - relicMiss;

  const structure = 15 * core + 20 * loop + 10 * output + 10 * support
    + ammo + 5 * relicSupport + 35 * core * loop + 5 * relicSupport * loop
    - 3 * Math.max(0, coreCount - 1) - anti - poison;
  const setup = setupProbability(
    size,
    coreCount,
    count('POMMEL_STRIKE') + count('PILLAGE'),
    relicSet.has('BAG_OF_PREPARATION') ? 2 : 0
  );
  return Math.max(0, Math.min(100, 0.9 * structure + 10 * setup));
}

function impactReason(candidateId, deltaPoints, coreActive) {
  if (!candidateId) return null;
  if (POISON_WEIGHTS[candidateId] != null) return '破坏循环';
  if (ANTI_WEIGHTS[candidateId] != null) return '支线冲突';
  if (candidateId === 'HELLRAISER') return '启动';
  if (candidateId === 'POMMEL_STRIKE' || candidateId === 'PILLAGE') return '循环';
  if (candidateId === 'PERFECTED_STRIKE') return '输出';
  if (AMMO_WEIGHTS[candidateId] != null) return coreActive ? '弹药' : '稀释';
  if (candidateId === 'RAGE') return coreActive ? '连打协同' : '稀释';
  if (SUPPORT_RATES[candidateId] != null || CONDITIONAL_SUPPORT[candidateId]) {
    return deltaPoints > 0 ? '过牌辅助' : '稀释';
  }
  if (deltaPoints < 0) return '稀释';
  if (deltaPoints > 0) return '过牌辅助';
  return '稀释';
}

function autoStrikeImpact(deck, relics, candidate) {
  if (!cardId(candidate)) return null;
  const id = cardId(candidate);
  const before = autoStrikeScore(deck, relics);
  const after = autoStrikeScore([...(deck || []), candidate], relics);
  const deltaPoints = Math.round(after - before);
  const coreActive = (deck || []).some(card => cardId(card) === 'HELLRAISER')
    || id === 'HELLRAISER';
  return {
    id: 'auto_strike',
    name: '自动打击流',
    deltaPoints,
    reason: impactReason(id, deltaPoints, coreActive)
  };
}

function decorateAutoStrikeCards(character, deck, relics, candidates) {
  if (!isIronclad(character) || !Array.isArray(candidates)) return candidates;
  return candidates.map(candidate => {
    const card = typeof candidate === 'string' ? { id: candidate, name: candidate } : candidate;
    const impact = autoStrikeImpact(deck, relics, card);
    return impact ? { ...card, archetypeImpact: impact } : candidate;
  });
}

function draftImpactMessage(rewardEvent, character, cards) {
  if (rewardEvent?.name !== 'card.reward.opened'
    || !isIronclad(character)
    || !rewardEvent.data?.signature
    || !Array.isArray(cards)) return null;
  const impacts = cards
    .filter(card => card?.id && card.archetypeImpact?.id === 'auto_strike'
      && Number.isInteger(card.archetypeImpact.deltaPoints))
    .map(card => ({
      cardId: card.id,
      deltaPoints: card.archetypeImpact.deltaPoints,
      reason: card.archetypeImpact.reason || undefined
    }));
  return impacts.length
    ? { type: 'draft_impact', signature: rewardEvent.data.signature, impacts }
    : null;
}

module.exports = {
  autoStrikeScore,
  autoStrikeImpact,
  decorateAutoStrikeCards,
  draftImpactMessage,
  isIronclad
};
