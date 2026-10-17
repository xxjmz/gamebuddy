'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DanmakuLlmAtmosphere } = require('../danmaku/llm-atmosphere');

const context = { character: 'ironclad', trigger: 'enemy_move', facts: ['小啃兽当前行动：攻击'] };

test('AI results are consumed once per context and select two distinct phrases', async () => {
  let now = 0;
  let calls = 0;
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => {
    calls += 1;
    return { phrases: ['这一下，记下了。', '又能往上走了。'] };
  } } });
  assert.deepEqual((await model.generate(context)).phrases, ['这一下，记下了。', '又能往上走了。']);
  now = 4000;
  assert.equal((await model.generate(context)).status, 'duplicate');
  assert.equal(calls, 1);
  now = 90_000;
  assert.equal((await model.generate(context)).status, 'generated');
  assert.equal(calls, 2);
});

test('concurrent consumers cannot replay the same pending response', async () => {
  let resolve;
  let calls = 0;
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: () => {
    calls += 1;
    return new Promise(done => { resolve = done; });
  } } });
  const first = model.generate(context);
  assert.equal((await model.generate(context)).status, 'duplicate');
  resolve({ phrases: ['又能往上走了。'] });
  assert.equal((await first).status, 'generated');
  assert.equal(calls, 1);
});

test('different context still respects rate limit and recent-text exclusion', async () => {
  let now = 0;
  const payloads = [];
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async payload => {
    payloads.push(payload);
    return { phrases: ['这一下记下了！'] };
  } } });
  assert.equal((await model.generate({ ...context, recentTexts: ['这一下，记下了。'] })).status, 'duplicate');
  assert.deepEqual(payloads[0].recentTexts, ['这一下，记下了。']);
  assert.equal((await model.generate({ ...context, facts: ['新行动'] })).status, 'throttled');
  assert.equal(payloads.length, 1);
  now = 4000;
  assert.equal((await model.generate({ ...context, facts: ['新行动'] })).status, 'generated');
  now = 8000;
  assert.equal((await model.generate({ ...context, facts: ['另一行动'] })).status, 'duplicate');
});

test('unavailable, failed, malformed and deliberately silent outputs are distinguishable', async () => {
  assert.equal((await new DanmakuLlmAtmosphere().generate(context)).status, 'unavailable');
  for (const [completeDanmaku, expected] of [
    [async () => { throw new Error('timeout'); }, 'failed'],
    [async () => ({ phrases: ['http://bad.example'] }), 'failed'],
    [async () => ({}), 'failed'],
    [async () => ({ phrases: [] }), 'duplicate']
  ]) {
    const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku } });
    assert.equal((await model.generate(context)).status, expected);
    assert.equal(model.pending.size, 0);
  }
});


test('all five characters receive distinct persona styles and unknown character stays neutral', async () => {
  const { personalityFor, normalizeCharacter } = require('../danmaku/language-profile');
  const payloads = [];
  for (const character of ['ironclad', 'silent', 'defect', 'regent', 'necrobinder', 'unknown']) {
    const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async payload => {
      payloads.push(payload); return { phrases: [] };
    } } });
    await model.generate({ ...context, character });
    assert.equal(payloads.at(-1).style, personalityFor(character).style);
    assert.equal(payloads.at(-1).count, 2);
    assert.equal(payloads.at(-1).examples.length, 2);
  }
  assert.equal(new Set(payloads.map(item => item.style)).size, 6);
  assert.equal(payloads.at(-1).character, 'generic');
  assert.equal(normalizeCharacter('Necrobinder'), 'necrobinder');
  assert.equal(normalizeCharacter('亡灵契约师'), 'necrobinder');
  assert.equal(normalizeCharacter('储君'), 'regent');
});

test('periodic batch IDs bypass consumed context cache but keep output dedupe', async () => {
  let now = 0; let calls = 0;
  const model = new DanmakuLlmAtmosphere({ now: () => now, llm: { enabled: true, completeDanmaku: async () => {
    calls += 1;
    return { phrases: calls === 1 ? ['这一拳记下了。', '这一拳，记下了！'] : ['这一拳记下了。', '这伤疤也算个纪念。'] };
  } } });
  assert.equal((await model.generate({ ...context, batchId: 'one' })).phrases.length, 1);
  now = 15000;
  assert.deepEqual((await model.generate({ ...context, batchId: 'two' })).phrases, ['这伤疤也算个纪念。']);
  assert.equal(calls, 2);
});

test('60 second client accepts slow results and keeps the deadline through response body reading', async t => {
  const { createOpenAiClient } = require('../llm/openai');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'log', () => {});
  let request;
  const client = createOpenAiClient({ enabled: true, apiKey: 'test-only', model: 'test', baseURL: 'https://mock.invalid', wireApi: 'chat' }, {
    timeoutMs: 60_000,
    fetchImpl: async (_url, options) => {
      request = { ...options };
      return { ok: true, json: () => new Promise((resolve, reject) => {
        request.resolve = resolve;
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }) };
    }
  });
  const first = client.completeDanmaku({ character: 'regent', style: '矜贵自负', count: 2 });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(16_000);
  assert.equal(request.signal.aborted, false);
  const body = JSON.parse(request.body);
  assert.match(body.messages[0].content, /生成 2 句/);
  request.resolve({ choices: [{ message: { content: '{"phrases":["这里的迎宾礼欠缺教养。","王冠可以歪，仪态不能。"]}' } }] });
  assert.equal((await first).phrases.length, 2);
  const second = client.completeDanmaku({ character: 'silent' });
  const rejection = assert.rejects(second, /aborted/);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(59_999);
  assert.equal(request.signal.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(request.signal.aborted, true);
  await rejection;
});

test('scene abort propagates without changing other clients default 120 second timeout', async t => {
  const { createOpenAiClient } = require('../llm/openai');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(console, 'log', () => {});
  const requests = [];
  const client = createOpenAiClient({ enabled: true, apiKey: 'test-only', model: 'test', baseURL: 'https://mock.invalid' }, {
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      requests.push(options);
      options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    })
  });
  const controller = new AbortController();
  const first = client.completeDanmaku({}, { signal: controller.signal });
  const firstRejection = assert.rejects(first, /aborted/);
  controller.abort();
  await firstRejection;
  const second = client.completeDanmaku({});
  const secondRejection = assert.rejects(second, /aborted/);
  t.mock.timers.tick(60_000);
  assert.equal(requests[1].signal.aborted, false);
  t.mock.timers.tick(60_000);
  await secondRejection;
});
