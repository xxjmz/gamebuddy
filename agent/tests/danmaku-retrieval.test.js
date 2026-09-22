'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuRetriever, queryFor } = require('../danmaku/retrieval');

test('retriever uses a trigger-specific query and preserves source metadata', async () => {
  let received;
  const retriever = new DanmakuRetriever({
    timeoutMs: 100,
    embedder: { embed: async input => { received = input; return [[0.1, 0.2]]; } },
    store: { query: async (_embedding, options) => {
      assert.equal(options.trigger, 'low_hp');
      assert.equal(options.scene, 'combat');
      assert.equal(options.tone, 'tense');
      return [{ text: '加油', distance: 0.2, metadata: { bvid: 'BV1', atSeconds: 1.2 } }];
    } }
  });
  const results = await retriever.retrieve({ trigger: 'low_hp', tone: 'tense', enemyNames: ['帝皇蟹'], hpRatio: 0.2 });
  assert.match(received, /帝皇蟹/);
  assert.deepEqual(results[0], {
    text: '加油', score: 1 / 1.2, triggers: ['low_hp'], bvid: 'BV1', atSeconds: 1.2, source: 'bilibili'
  });
});

test('retriever failure returns no corpus phrase so the director can use original wording', async () => {
  const retriever = new DanmakuRetriever({
    timeoutMs: 20,
    embedder: { embed: async () => { throw new Error('offline'); } },
    store: { query: async () => [] }
  });
  assert.deepEqual(await retriever.retrieve({ trigger: 'entry' }), []);
  assert.match(queryFor({ trigger: 'boss', enemyNames: ['帝皇蟹'] }), /帝皇蟹/);
});

test('retriever logs explicit fallback reasons without throwing', async () => {
  const events = [];
  const retriever = new DanmakuRetriever({
    embedder: { embed: async () => { throw new Error('Ollama offline'); } },
    store: { query: async () => [] },
    onLog: entry => events.push(entry)
  });
  assert.deepEqual(await retriever.retrieve({ trigger: 'attack', scene: 'combat' }), []);
  assert.deepEqual(events.map(entry => entry.event), ['ollama_embedding', 'fallback']);
  assert.match(events.at(-1).reason, /Ollama offline/);
});
