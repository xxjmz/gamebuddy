'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuDirector } = require('../danmaku/director');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');

function state({ sequence = 1, combat = true, floor = 4, enemies } = {}) {
  return {
    schema: 'gamebuddy.state.v1', timestamp: sequence,
    run: { act: 1, floor, room: combat ? 'combat' : 'map', character: 'ironclad' },
    player: { hp: 60, maxHp: 80, block: 0, gold: 120, energy: 3, maxEnergy: 3, cards: [], relics: [], potions: [] },
    combat: combat ? {
      turn: sequence,
      hand: [], drawPile: [], discardPile: [], exhaustPile: [],
      enemies: enemies || [{ id: 'NIBBIT', name: '小啃兽', hp: 20, maxHp: 20, block: 0, intent: 'AttackIntent', alive: true }]
    } : null,
    map: { visited: [] }
  };
}

function observation(sequence, input) {
  return { schema: 'gamebuddy.observation.v1', sequence, fresh: true, state: input };
}

test('director only queues explicit fixed dialogue and never adds corpus or model text', () => {
  let now = 0;
  const director = new DanmakuDirector({ now: () => now, gapMs: 450 });
  const scope = { runId: 'run', sceneId: 'scene', stateRevision: 1 };
  director.setContext(scope);
  const result = director.burst({
    ...scope,
    eventId: 'move-1',
    trigger: 'enemy_move',
    factTexts: ['撕咬！恶狠狠的：没什么，我只是要狠狠地给你来一下。']
  });
  assert.equal(result.count, 1);
  assert.equal(director.queue[0].text.startsWith('撕咬！'), true);
});

test('combat entry uses one encounter headline and queues current actions', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  const input = state({ enemies: [
    { id: 'NIBBIT', name: '小啃兽', hp: 42, maxHp: 46, block: 0, intent: 'AttackIntent', alive: true },
    { id: 'NIBBIT', name: '小啃兽', hp: 40, maxHp: 46, block: 0, intent: 'AttackIntent', alive: true }
  ] });
  const result = await adapter.ingestObservation(observation(1, input), { runId: 'run' });
  assert.equal(result.accepted, true);
  const headline = adapter.director.queue.find(item => item.text === '两只小啃兽来袭～');
  assert.ok(headline);
  assert.match(headline.detail.lines.join('\n'), /循环/);
  const actions = adapter.director.queue.filter(item => /！/.test(item.text) && item.text !== headline.text);
  assert.equal(actions.length, 2);
  assert.equal(actions.every(item => !item.text.startsWith('小啃兽')), true);
  assert.equal(actions.every(item => /刚才大概是这么说的/.test(item.detail.title)), true);
  assert.equal(actions.every(item => item.detail.lines.some(line => line.startsWith('行动：'))), true);
});

test('every changed action emits, including ordinary attacks and defenses', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  const first = state({ sequence: 1, enemies: [{ id: 'NIBBIT', name: '小啃兽', intent: 'AttackIntent', nextMoveName: '撕咬', alive: true }] });
  await adapter.ingestObservation(observation(1, first), { runId: 'run' });
  const before = adapter.director.queue.length;
  const second = state({ sequence: 2, enemies: [{ id: 'NIBBIT', name: '小啃兽', intent: 'DefendIntent', nextMoveName: '缩壳', alive: true }] });
  const result = await adapter.ingestObservation(observation(2, second), { runId: 'run' });
  assert.equal(result.accepted, true);
  assert.equal(adapter.director.queue.length > before, true);
  const latest = adapter.director.queue.at(-1);
  assert.match(latest.text, /缩壳！/);
  assert.match(latest.detail.lines.join('\n'), /类型：防御/);
});

test('recommendations create deterministic advice danmaku with hover description', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  const result = await adapter.ingestRecommendation({
    schema: 'gamebuddy.recommendation.v1',
    task: 'card_reward',
    timestamp: 12,
    source: 'rules',
    primary: {
      action: 'TAKE_CARD', cardName: '测试护盾卡',
      analysis: { description: '获得 8 点格挡并抽 1 张牌' }
    },
    reason: '当前牌组缺少稳定防御。'
  }, {
    runId: 'run',
    observation: { sequence: 4, state: state({ combat: false }) }
  });
  assert.equal(result.accepted, true);
  const item = adapter.director.queue[0];
  assert.equal(item.text, '选牌建议！拿下「测试护盾卡」。');
  assert.match(item.detail.lines.join('\n'), /获得 8 点格挡/);
  assert.match(item.detail.lines.join('\n'), /当前牌组缺少稳定防御/);
  assert.equal(item.detail.source, 'recommendation');
});

test('stale duplicate observations do not create a second combat wave', async () => {
  const adapter = new DanmakuBridgeAdapter({ now: () => 0 });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const count = adapter.director.queue.length;
  const result = await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  assert.equal(result.reason, 'old_observation');
  assert.equal(adapter.director.queue.length, count);
});

test('shared combat messages are fetched by character and monster scene without blocking local facts', async () => {
  const sharedClient = {
    enabled: true,
    async list({ sceneKey, phase }) {
      assert.equal(sceneKey, 'sts2-v1:ironclad:combat:nibbit');
      assert.equal(phase, 'combat');
      return [{ id: 'shared-1', text: '这虫子看着憨，打起来全是心眼。' }];
    }
  };
  const adapter = new DanmakuBridgeAdapter({ now: () => 0, sharedClient });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.getSharedScene().sceneKey, 'sts2-v1:ironclad:combat:nibbit');
  assert.ok(adapter.director.queue.some(item => item.text === '这虫子看着憨，打起来全是心眼。'));
});

test('death switches shared timing to death while keeping the same scene object', async () => {
  const sharedClient = {
    enabled: true,
    async list({ phase }) {
      return phase === 'death' ? [{ id: 'shared-death', text: '倒在这里，也算见过世面了。' }] : [];
    }
  };
  const adapter = new DanmakuBridgeAdapter({ now: () => 0, sharedClient });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const dead = state({ sequence: 2, combat: false });
  dead.player.hp = 0;
  await adapter.ingestObservation(observation(2, dead), { runId: 'run' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.getSharedScene().phase, 'death');
  assert.equal(adapter.getSharedScene().sceneKey, 'sts2-v1:ironclad:combat:nibbit');
  assert.ok(adapter.director.queue.some(item => item.text === '倒在这里，也算见过世面了。'));
});
