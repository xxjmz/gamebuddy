const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createOpenAiClient } = require('../llm/openai');
const {
  DEFAULT_GATEWAY_URL,
  buildPreferredConfig,
  createFallbackLlm,
  readGatewayPreference,
  writeGatewayPreference
} = require('../llm/preferred-gateway');

const base = {
  enabled: true,
  apiKey: 'original-key',
  baseURL: 'https://ai.gs88.shop/v1',
  model: 'deepseek-v4-pro',
  wireApi: 'responses'
};

function jsonResponse(content) {
  return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) };
}

test('blank api key does not write a preference', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-gateway-'));
  const file = path.join(dir, 'llm-gateway.json');
  const saved = writeGatewayPreference(file, { apiKey: '  ', baseURL: DEFAULT_GATEWAY_URL });
  assert.equal(saved.ok, false);
  assert.equal(fs.existsSync(file), false);
  assert.equal(readGatewayPreference(file), null);
});

test('company gateway uses chat completions and X-Api-Key', async () => {
  const beforeKey = process.env.GAMEBUDDY_LLM_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-gateway-'));
  const file = path.join(dir, 'llm-gateway.json');
  const saved = writeGatewayPreference(file, { apiKey: 'company-key', baseURL: 'https://copilot.tencent.com/v2/' });
  assert.equal(saved.preference.baseURL, 'https://copilot.tencent.com/v2');
  assert.equal(process.env.GAMEBUDDY_LLM_API_KEY, beforeKey);
  const preference = readGatewayPreference(file);
  const config = buildPreferredConfig(base, preference);
  const requests = [];
  const client = createOpenAiClient(config, {
    fetchImpl: async (url, options) => {
      requests.push({ url, headers: options.headers });
      return jsonResponse('{"index":0,"reason":"公司网关"}');
    }
  });
  const result = await client.completeRoute({ candidates: [{ index: 0 }] });
  assert.equal(result.index, 0);
  assert.equal(requests[0].url, 'https://copilot.tencent.com/v2/chat/completions');
  assert.equal(requests[0].headers['X-Api-Key'], 'company-key');
  assert.equal(requests[0].headers.Authorization, undefined);
});

test('a replaced gateway keeps the original wire api and bearer auth', async () => {
  const config = buildPreferredConfig(base, { apiKey: 'other-key', baseURL: 'https://example.test/v1' });
  const requests = [];
  const client = createOpenAiClient(config, {
    fetchImpl: async (url, options) => {
      requests.push({ url, headers: options.headers, body: JSON.parse(options.body) });
      return { ok: false, status: 401, text: async () => 'unauthorized' };
    }
  });
  await assert.rejects(client.completeRoute({ candidates: [{ index: 0 }] }));
  assert.equal(requests[0].url, 'https://example.test/v1/responses');
  assert.equal(requests[0].headers.Authorization, 'Bearer other-key');
  assert.equal(requests[0].headers['X-Api-Key'], undefined);
});

test('preferred failure falls back to the original client', async () => {
  const requests = [];
  const preferred = createOpenAiClient(buildPreferredConfig(base, { apiKey: 'company-key', baseURL: DEFAULT_GATEWAY_URL }), {
    fetchImpl: async (url, options) => {
      requests.push({ url, key: options.headers['X-Api-Key'] || options.headers.Authorization });
      return { ok: false, status: 401, text: async () => 'unauthorized company-key' };
    }
  });
  const original = createOpenAiClient({ ...base, wireApi: 'chat' }, {
    fetchImpl: async (url, options) => {
      requests.push({ url, key: options.headers.Authorization });
      return jsonResponse('{"index":1,"reason":"原来的"}');
    }
  });
  const notes = [];
  const client = createFallbackLlm(preferred, original, { onFallback: note => notes.push(note), redactKey: 'company-key' });
  const result = await client.completeRoute({ candidates: [{ index: 1 }] });
  assert.equal(result.index, 1);
  assert.equal(requests[0].url, 'https://copilot.tencent.com/v2/chat/completions');
  assert.equal(requests[1].url, 'https://ai.gs88.shop/v1/chat/completions');
  assert.equal(requests[1].key, 'Bearer original-key');
  assert.equal(notes.some(note => note.includes('company-key')), false);
});

test('a successful preferred response does not call the original client', async () => {
  let calls = 0;
  const preferred = {
    enabled: true,
    completeRoute: async () => ({ index: 0, reason: '优先' })
  };
  const original = {
    enabled: true,
    completeRoute: async () => { calls += 1; return { index: 1, reason: '原来的' }; }
  };
  const result = await createFallbackLlm(preferred, original).completeRoute({});
  assert.equal(result.reason, '优先');
  assert.equal(calls, 0);
});

test('cancelling the preferred request does not start the original client', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const preferred = {
    enabled: true,
    completeDanmaku: async () => { throw new Error('aborted'); }
  };
  const original = {
    enabled: true,
    completeDanmaku: async () => { calls += 1; return { phrases: [] }; }
  };
  await assert.rejects(
    createFallbackLlm(preferred, original).completeDanmaku({}, { signal: controller.signal }),
    /aborted/
  );
  assert.equal(calls, 0);
});

test('no saved preference keeps the original bearer request', async () => {
  const requests = [];
  const client = createOpenAiClient({ ...base, wireApi: 'chat' }, {
    fetchImpl: async (url, options) => {
      requests.push({ url, authorization: options.headers.Authorization });
      return jsonResponse('{"index":0,"reason":"原来的"}');
    }
  });
  await client.completeRoute({ candidates: [{ index: 0 }] });
  assert.equal(requests[0].url, 'https://ai.gs88.shop/v1/chat/completions');
  assert.equal(requests[0].authorization, 'Bearer original-key');
});
