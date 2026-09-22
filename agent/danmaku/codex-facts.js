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
  const add = (text, tag, monsterId, detail) => {
    if (!text || seen.has(`${monsterId}:${tag}`) || output.length >= 3) return;
    seen.add(`${monsterId}:${tag}`);
    output.push({
      text,
      source: 'codex',
      memeFamily: `codex-${tag}`,
      mechanismTag: tag,
      monsterId,
      detail
    });
  };
  for (const enemy of enemies) {
    const monster = lookupMonster(enemy?.id || enemy?.name);
    if (!monster || !enemy?.name) continue;
    const monsterId = monster.id || enemy.id || null;
    const detail = monsterDetail(enemy);
    const moves = (monster.moves || []).filter(move => move?.name || move?.id);
    const moveNames = moves.map(move => move.name || move.id).slice(0, 4);
    if (moveNames.length) add(`${enemy.name}会使用${moveNames.join('、')}。`, 'moves', monsterId, detail);
    for (const tag of mechanicTags(monster)) {
      if (NATURAL_FACTS[tag]) add(NATURAL_FACTS[tag](enemy.name), tag, monsterId, detail);
      if (output.length >= 3) return output;
    }
    for (const move of moves) {
      const damage = Number.isFinite(move?.damage?.normal) ? move.damage.normal : null;
      if (damage !== null) add(`${move.name || move.id}的基础伤害为 ${damage}。`, `damage-${move.id || move.name}`, monsterId, detail);
      if (output.length >= 3) return output;
    }
  }
  return output;
}

function monsterDetail(enemy) {
  const monster = lookupMonster(enemy?.id || enemy?.name);
  if (!monster) return null;
  const lines = [];
  const moves = (monster.moves || []).filter(move => move?.name || move?.id);
  if (moves.length) lines.push(`招式：${moves.map(move => move.name || move.id).join('、')}`);
  if (monster.attack_pattern?.description) lines.push(`行动顺序：${monster.attack_pattern.description}`);
  for (const power of monster.innate_powers || []) {
    const name = power?.name || power?.power_id;
    if (name) lines.push(`固有能力：${name}`);
  }
  return { title: enemy.name || monster.name || monster.id, lines, monsterId: monster.id || null, source: 'codex' };
}

function currentMoveDetail(enemy) {
  if (!enemy?.nextMoveId && !enemy?.nextMoveName) return null;
  const monster = lookupMonster(enemy.id || enemy.name);
  if (!monster) return null;
  const key = String(enemy.nextMoveId || '').toUpperCase();
  const move = (monster.moves || []).find(candidate => (
    key && String(candidate.id || '').toUpperCase() === key
  ) || (!key && enemy.nextMoveName && candidate.name === enemy.nextMoveName));
  if (!move) return null;
  const lines = [];
  if (move.intent) lines.push(`意图：${move.intent}`);
  if (Number.isFinite(move?.damage?.normal)) lines.push(`基础伤害：${move.damage.normal}`);
  if (Number.isFinite(move?.damage?.ascension)) lines.push(`高难度伤害：${move.damage.ascension}`);
  if (Number.isFinite(move?.damage?.hit_count) || Number.isFinite(move?.hit_count)) {
    lines.push(`命中次数：${move.damage?.hit_count ?? move.hit_count}`);
  }
  if (Number.isFinite(move.block)) lines.push(`获得格挡：${move.block}`);
  if (Number.isFinite(move.heal)) lines.push(`回复生命：${move.heal}`);
  if (move.description) lines.push(move.description);
  return {
    title: move.name || enemy.nextMoveName || move.id,
    lines,
    moveId: move.id || null,
    monsterId: monster.id || enemy.id || null,
    source: 'codex'
  };
}

module.exports = { codexFactCandidates, monsterDetail, currentMoveDetail, NATURAL_FACTS };
