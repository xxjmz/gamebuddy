'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuLlmAtmosphere, cleanPhrase } = require('../danmaku/llm-atmosphere');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');
const { SPECIALTY_PHRASES } = require('../danmaku/catalog');

function state(intent) {
  return {
    run: { character: 'ironclad', room: 'combat' },
    player: { hp: 60, maxHp: 80, energy: 3, block: 0 },
    combat: { turn: 1, enemies: [{ name: '帝皇蟹', intent, alive: true }] }
  };
}

function observation(sequence, input) {
  return { schema: 'gamebuddy.observation.v1', sequence, fresh: true, state: input };
}

test('LLM atmosphere accepts short safe phrases and rejects strategy text', async () => {
  const generator = new DanmakuLlmAtmosphere({
    llm: {
      enabled: true,
      completeDanmaku: async () => ({ phrases: ['这下有节目了', '这回合必须打防御', '前方高能，镜头跟紧'] })
    },
    onLog: () => {}
  });
  const items = await generator.generate({ characterKey: 'ironclad', trigger: 'attack', tone: 'tense', sceneTags: ['attack'] });
  assert.deepEqual(items.map(item => item.text), ['这下有节目了', '前方高能，镜头跟紧']);
  assert.equal(cleanPhrase('这回合必须打防御'), '');
});

test('specialty phrase pack contains only locally safe atmosphere wording', () => {
  assert.equal(SPECIALTY_PHRASES.every(item => cleanPhrase(item.text) === item.text), true);
});

test('LLM failure falls back without throwing', async () => {
  const generator = new DanmakuLlmAtmosphere({
    llm: { enabled: true, completeDanmaku: async () => { throw new Error('timed out'); } },
    onLog: () => {}
  });
  assert.deepEqual(await generator.generate({ trigger: 'attack', tone: 'tense', sceneTags: ['attack'] }), []);
});

test('LLM phrases append asynchronously without delaying attack facts', async () => {
  const adapter = new DanmakuBridgeAdapter({
    retriever: { retrieve: async () => [] },
    llmAtmosphere: { generate: async () => [{ text: '镜头别切，继续看', source: 'llm_atmosphere', memeFamily: 'llm' }] }
  });
  await adapter.ingestObservation(observation(1, state('BuffIntent')), { runId: 'run' });
  await adapter.ingestObservation(observation(2, state('AttackIntent')), { runId: 'run' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(adapter.director.queue.some(item => item.text === '帝皇蟹试图攻击你。' && item.source === 'mod'), true);
  assert.equal(adapter.director.queue.some(item => item.text === '镜头别切，继续看' && item.source === 'llm_atmosphere'), true);
});
