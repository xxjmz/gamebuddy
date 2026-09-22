'use strict';

const { lookupMonster } = require('../codex-db');
const { mechanicTags } = require('../knowledge/spire-codex');

const NATURAL_FACTS = {
  multi_hit: enemy => `${enemy}的攻击可能连续命中。`,
  aoe: enemy => `${enemy}可能同时压迫多个目标。`,
  summons: enemy => `${enemy}可能召来帮手。`,
  status_cards: enemy => `${enemy}可能塞入状态牌。`,
  scaling: enemy => `${enemy}会在战斗中逐渐变强。`,
  debuffs: enemy => `${enemy}可能施加减益。`,
  artifact: enemy => `${enemy}带有人工制品保护。`,
  thorns: enemy => `${enemy}会造成反伤。`,
  healing: enemy => `${enemy}可能回复生命。`,
  block: enemy => `${enemy}可能获得格挡。`
};

function codexFactCandidates(enemies = []) {
  const seen = new Set();
  const output = [];
  const add = (text, tag, monsterId) => {
    if (!text || seen.has(`${monsterId}:${tag}`) || output.length >= 3) return;
    seen.add(`${monsterId}:${tag}`);
    output.push({
      text,
      source: 'codex',
      memeFamily: `codex-${tag}`,
      mechanismTag: tag,
      monsterId
    });
  };
  for (const enemy of enemies) {
    const monster = lookupMonster(enemy?.id || enemy?.name);
    if (!monster || !enemy?.name) continue;
    const monsterId = monster.id || enemy.id || null;
    const moves = (monster.moves || []).filter(move => move?.name || move?.id);
    const moveNames = moves.map(move => move.name || move.id).slice(0, 4);
    if (moveNames.length) add(`${enemy.name}会使用${moveNames.join('、')}。`, 'moves', monsterId);
    if (monster.attack_pattern?.type === 'cycle') add(`${enemy.name}会在这些招式间循环行动。`, 'cycle', monsterId);
    for (const tag of mechanicTags(monster)) {
      if (NATURAL_FACTS[tag]) add(NATURAL_FACTS[tag](enemy.name), tag, monsterId);
      if (output.length >= 3) return output;
    }
    for (const move of moves) {
      const damage = Number.isFinite(move?.damage?.normal) ? move.damage.normal : null;
      if (damage !== null) add(`${move.name || move.id}的基础伤害为 ${damage}。`, `damage-${move.id || move.name}`, monsterId);
      if (output.length >= 3) return output;
    }
  }
  return output;
}

module.exports = { codexFactCandidates, NATURAL_FACTS };
