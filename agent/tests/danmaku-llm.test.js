'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuLlmAtmosphere, cleanPhrase } = require('../danmaku/llm-atmosphere');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');
const { SPECIALTY_PHRASES } = require('../danmaku/catalog');

function state(nextMoveId, nextMoveName) {
  return {
    run: { character: 'ironclad', room: 'combat' },
    player: { hp: 60, maxHp: 80, energy: 3, block: 0 },
    combat: {
      turn: 1,
      enemies: [{
        id: 'AEONGLASS',
        name: '永世沙漏',
        intent: 'AttackIntent',
        nextMoveId,
        nextMoveName,
        alive: true
      }]
    }
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

test('known current move renders only its name with Codex detail', async () => {
  const adapter = new DanmakuBridgeAdapter({
    retriever: { retrieve: async () => [] }
  });
  await adapter.ingestObservation(observation(1, state('EBB', '消退')), { runId: 'run' });
  await adapter.ingestObservation(observation(2, state('EYE_LASERS', '眼部激光')), { runId: 'run' });
  const move = adapter.director.queue.find(item => item.text === '眼部激光');
  assert.equal(move.source, 'mod');
  assert.equal(move.detail.title, '眼部激光');
  assert.equal(move.detail.moveId, 'EYE_LASERS');
});
