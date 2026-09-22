'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuDirector } = require('../danmaku/director');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');

function state({ hp = 60, maxHp = 80, combat = true, floor = 4, intent = 'AttackIntent' } = {}) {
  return {
    schema: 'gamebuddy.state.v1', timestamp: 1, source: 'test',
    run: { act: 1, floor, room: combat ? 'combat' : 'map', character: 'ironclad' },
    player: { hp, maxHp, block: 0, gold: 0, energy: 3, maxEnergy: 3, cards: [], relics: [], potions: [] },
    combat: combat ? { turn: 1, hand: [], drawPile: [], discardPile: [], exhaustPile: [], enemies: [{ name: '帝皇蟹', hp: 20, maxHp: 20, block: 0, intent, alive: true }] } : null,
    map: { visited: [] }
  };
}

function observation(sequence, input) {
  return { schema: 'gamebuddy.observation.v1', sequence, fresh: true, state: input };
}

test('director queues a distinct high-density staggered wave', () => {
  let now = 0;
  const director = new DanmakuDirector({ now: () => now, random: () => 0.2, burstSize: 8, gapMs: 450 });
  const scope = { runId: 'run', sceneId: 'scene', stateRevision: 1 };
  director.setContext(scope);
  const result = director.burst({
    ...scope,
    eventId: 'entry-1',
    trigger: 'attack',
    factTexts: ['帝皇蟹 · 攻击意图'],
    localCandidates: [{ text: '前方高能，镜头跟紧', source: 'local_phrase_pack', memeFamily: '前方高能' }],
    corpusCandidates: [{ text: '来了', source: 'bilibili' }, { text: '好耶', source: 'bilibili' }]
  });
  assert.equal(result.count, 8);
  const first = director.tick();
  now += 450;
  const second = director.tick();
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first[0].text, second[0].text);
  assert.equal(first[0].lane, 0);
  assert.equal(second[0].lane, 1);
});

test('director ignores an empty queue item without crashing the main-process timer', () => {
  const director = new DanmakuDirector({ now: () => 5000 });
  director.setContext({ runId: 'run-1', sceneId: 'combat-1', stateRevision: 1 });
  director.queue.push(undefined);
  assert.deepEqual(director.tick(), []);
});

test('adapter never renders generic upstream recommendation status', async () => {
  const adapter = new DanmakuBridgeAdapter({ random: () => 0.3, retriever: { retrieve: async () => [] } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  const current = adapter.scope;
  assert.equal((await adapter.ingestRecommendation({ type: 'battle_turn_plan', planId: 'old', ...current, stateRevision: 0 }, current)).accepted, false);
  const ignored = await adapter.ingestRecommendation({ type: 'battle_turn_plan', planId: 'current', ...current, certainty: 'tentative' }, current);
  assert.deepEqual(ignored, { accepted: false, reason: 'recommendation_not_rendered' });
  assert.equal(adapter.director.queue.some(item => /建议|方案/.test(item.text)), false);
});

test('low hp and unknown combat exit do not claim victory', async () => {
  const adapter = new DanmakuBridgeAdapter({ random: () => 0.3, retriever: { retrieve: async () => [] } });
  const first = await adapter.ingestObservation(observation(1, state({ hp: 10 })), { runId: 'run' });
  assert.equal(first.accepted, true);
  const close = await adapter.ingestObservation(observation(2, state({ combat: false })), { runId: 'run' });
  assert.equal(close.accepted, true);
  assert.equal(adapter.director.queue.every(item => item.trigger !== 'victory'), true);
});

test('duplicate observations do not make a second wave', async () => {
  const adapter = new DanmakuBridgeAdapter({ retriever: { retrieve: async () => [] } });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  assert.equal((await adapter.ingestObservation(observation(1, state()), { runId: 'run' })).reason, 'old_observation');
});

test('combat entry emits only Mod monster keywords without atmosphere retrieval', async () => {
  let retrievals = 0;
  const adapter = new DanmakuBridgeAdapter({
    random: () => 0.3,
    retriever: {
      retrieve: async () => {
        retrievals += 1;
        return [{ text: '来了', bvid: 'BV1reviewed', atSeconds: 3.2, source: 'bilibili' }];
      }
    }
  });
  await adapter.ingestObservation(observation(1, state()), { runId: 'run' });
  assert.equal(retrievals, 0);
  assert.deepEqual(adapter.director.queue, []);
  assert.equal(adapter.director.queue.some(item => /进入战斗|出场|围观|来了/.test(item.text)), false);
});

test('combat entry appends multiple natural Codex facts when monster ID is known', async () => {
  const adapter = new DanmakuBridgeAdapter({ retriever: { retrieve: async () => [] } });
  const input = state();
  input.combat.enemies = [{ id: 'AEONGLASS', name: '永世沙漏', hp: 20, maxHp: 20, block: 0, intent: 'AttackIntent', alive: true }];
  await adapter.ingestObservation(observation(1, input), { runId: 'run' });
  assert.equal(adapter.director.queue.some(item => item.text.includes('永世沙漏会使用') && item.source === 'codex'), true);
  assert.equal(adapter.director.queue.some(item => /档案|标签|资料/.test(item.text)), false);
  assert.equal(adapter.director.queue.some(item => item.source === 'codex'), true);
});
