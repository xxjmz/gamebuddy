'use strict';

const { createLanguageProfile } = require('./language-profile');

const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanText(value, limit = 80) {
  return String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeIntent(intent) {
  const value = cleanText(intent).toLowerCase();
  if (!value || value === 'none') return 'none';
  if (/attack|hit|strike|damage/.test(value)) return 'attack';
  if (/buff|strength|ritual|enrage/.test(value)) return 'buff';
  if (/block|defend|guard/.test(value)) return 'block';
  if (/debuff|weak|frail|vulnerable|poison/.test(value)) return 'debuff';
  return 'other';
}

function healthBand(hp, maxHp) {
  if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || maxHp <= 0) return 'unknown';
  const ratio = hp / maxHp;
  if (ratio <= 0.25) return 'low';
  if (ratio <= 0.5) return 'caution';
  return 'healthy';
}

function eventTrigger(name) {
  const value = cleanText(name).toLowerCase();
  if (value === 'card.played') return 'card_played';
  if (value === 'combat.ended') return 'general';
  if (['enemy.spawned', 'enemy.revived', 'enemy.phase_changed'].includes(value)) return 'mechanic';
  return 'general';
}

function extractSceneContext({ state = {}, trigger, event } = {}) {
  const combat = state.combat || null;
  const player = state.player || {};
  const enemies = (combat?.enemies || [])
    .filter(enemy => enemy?.alive !== false)
    .map(enemy => ({
      id: cleanText(enemy?.id),
      name: cleanText(enemy?.name),
      intent: normalizeIntent(enemy?.intent),
      hp: Number.isFinite(enemy?.hp) ? enemy.hp : null,
      maxHp: Number.isFinite(enemy?.maxHp) ? enemy.maxHp : null,
      block: Number.isFinite(enemy?.block) ? enemy.block : null
    }))
    .filter(enemy => enemy.name);
  const playerHp = Number.isFinite(player.hp) ? player.hp : null;
  const playerMaxHp = Number.isFinite(player.maxHp) ? player.maxHp : null;
  const resolvedTrigger = trigger || eventTrigger(event?.name);
  const intentKinds = [...new Set(enemies.map(enemy => enemy.intent).filter(kind => kind !== 'none'))];
  const keywords = [
    combat ? '战斗' : cleanText(state.run?.room) || '场景',
    ...enemies.map(enemy => enemy.name),
    ...intentKinds.map(kind => kind === 'attack' ? '攻击意图' : `${kind}意图`),
    Number.isInteger(combat?.turn) ? `第${combat.turn}回合` : '',
    cleanText(event?.cardName || event?.data?.cardName || event?.data?.card?.name)
  ].filter(Boolean);
  const baseContext = {
    scene: combat ? 'combat' : 'general',
    trigger: resolvedTrigger,
    keywords: [...new Set(keywords)],
    enemyNames: enemies.map(enemy => enemy.name),
    enemies,
    attackEnemyNames: enemies.filter(enemy => enemy.intent === 'attack').map(enemy => enemy.name),
    intentKinds,
    hpBand: healthBand(playerHp, playerMaxHp),
    turn: Number.isInteger(combat?.turn) ? combat.turn : null,
    playerHp,
    playerMaxHp,
    energy: Number.isFinite(player.energy) ? player.energy : null,
    block: Number.isFinite(player.block) ? player.block : null,
    cardName: cleanText(event?.cardName || event?.data?.cardName || event?.data?.card?.name) || null,
    character: cleanText(state.run?.character).toLowerCase() || null,
    room: cleanText(state.run?.room).toLowerCase() || null,
    event
  };
  const profile = createLanguageProfile(baseContext);
  return { ...baseContext, ...profile };
}

function factLines(context, { previousHp, event } = {}) {
  const trigger = context?.trigger;
  if (trigger === 'entry') {
    const lines = [];
    if (Number.isInteger(context.turn)) lines.push(`第${context.turn}回合。`);
    for (const enemy of context.enemies || []) {
      if (enemy.hp !== null && enemy.maxHp !== null) lines.push(`${enemy.name}当前生命 ${enemy.hp}/${enemy.maxHp}。`);
      if (enemy.block > 0) lines.push(`${enemy.name}有 ${enemy.block} 点格挡。`);
      if (enemy.intent === 'attack') lines.push(`${enemy.name}试图攻击你。`);
      if (enemy.intent === 'buff') lines.push(`${enemy.name}正在强化。`);
      if (enemy.intent === 'block') lines.push(`${enemy.name}准备防守。`);
      if (enemy.intent === 'debuff') lines.push(`${enemy.name}准备施加减益。`);
    }
    if (lines.length < 3 && context.playerHp !== null && context.playerMaxHp !== null) {
      lines.push(`你的生命 ${context.playerHp}/${context.playerMaxHp}。`);
    }
    if (lines.length < 3 && context.energy !== null) lines.push(`你有 ${context.energy} 点能量。`);
    return [...new Set(lines)];
  }
  if (trigger === 'attack') return context.attackEnemyNames.map(name => `${name}试图攻击你。`);
  if (trigger === 'low_hp' && context.playerHp !== null && context.playerMaxHp !== null) {
    return ['你的生命偏低。'];
  }
  if (trigger === 'hp_drop' && Number.isFinite(previousHp) && context.playerHp !== null) {
    return ['你受伤了。'];
  }
  if (trigger === 'card_played' && context.cardName) return [`已使用「${context.cardName}」。`];
  if (trigger === 'mechanic') {
    const name = cleanText(event?.name);
    if (name === 'enemy.spawned') return ['出现了新的敌人。'];
    if (name === 'enemy.revived') return ['敌人已复活。'];
    if (name === 'enemy.phase_changed') return ['敌人阶段发生变化。'];
  }
  if (trigger === 'victory') return ['战斗胜利。'];
  if (trigger === 'defeat') return ['战斗结束。'];
  return [];
}

module.exports = { cleanText, normalizeIntent, healthBand, eventTrigger, extractSceneContext, factLines };
