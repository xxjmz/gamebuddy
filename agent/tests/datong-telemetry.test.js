const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildUploadBody, reportAppStart, UPLOAD_URL } = require('../telemetry/datong');

test('app start payload uses string fields and does not include the api key', () => {
  const body = buildUploadBody({
    appKey: '0WEB0777J4N4ARWL',
    deviceId: 'device-1',
    eventCode: 'app_start',
    mapValue: { surface: 'desktop', count: 1 },
    now: 123
  });
  assert.equal(body.mainAppKey, '0WEB0777J4N4ARWL');
  assert.equal(body.common.A2, 'device-1');
  assert.equal(body.events[0].eventCode, 'app_start');
  assert.equal(body.events[0].eventTime, '123');
  assert.equal(body.events[0].mapValue.count, '1');
  assert.equal(JSON.stringify(body).includes('GAMEBUDDY_LLM_API_KEY'), false);
});

test('reportAppStart posts once and reuses the device id', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-datong-'));
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true };
  };
  const first = await reportAppStart({ userDataDir: dir, fetchImpl });
  const second = await reportAppStart({ userDataDir: dir, fetchImpl });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(requests[0].url, UPLOAD_URL);
  assert.equal(requests[0].body.events[0].eventCode, 'app_start');
  assert.equal(requests[0].body.common.A2, requests[1].body.common.A2);
});
