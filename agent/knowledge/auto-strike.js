const {
  scoreIroncladArchetypes,
  impactIroncladArchetypes,
  decorateIroncladArchetypes,
  isIronclad
} = require('./ironclad-archetypes');

function autoStrikeScore(deck, relics = []) {
  return scoreIroncladArchetypes(deck, relics)
    .find(score => score.id === 'auto_strike').score;
}

function legacyImpact(impact) {
  if (!impact) return null;
  const reason = {
    gate: '启动',
    engine: '循环',
    payoff: '输出',
    support: '过牌辅助',
    softAnti: '支线冲突'
  }[impact.role] || (/打击弹药/.test(impact.reason) ? '弹药'
    : impact.deltaPoints < 0 ? '稀释'
      : impact.reason);
  return { ...impact, reason };
}

function autoStrikeImpact(deck, relics, candidate) {
  return legacyImpact(impactIroncladArchetypes(deck, relics, candidate)
    ?.find(impact => impact.id === 'auto_strike') || null);
}

function decorateAutoStrikeCards(character, deck, relics, candidates) {
  const decorated = decorateIroncladArchetypes(character, deck, relics, candidates);
  if (decorated === candidates) return candidates;
  return decorated.map(card => card?.archetypeImpact
    ? { ...card, archetypeImpact: legacyImpact(card.archetypeImpact) }
    : card);
}

function draftImpactMessage(rewardEvent, character, cards) {
  if (rewardEvent?.name !== 'card.reward.opened'
    || !isIronclad(character)
    || !rewardEvent.data?.signature
    || !Array.isArray(cards)) return null;
  const impacts = cards
    .filter(card => card?.id && card.archetypeImpact?.id === 'auto_strike'
      && Number.isInteger(card.archetypeImpact.deltaPoints))
    .map(card => {
      const impact = legacyImpact(card.archetypeImpact);
      return {
        cardId: card.id,
        deltaPoints: impact.deltaPoints,
        reason: impact.reason || undefined
      };
    });
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
