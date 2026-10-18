const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const DATONG_APP_KEY = '0WEB0777J4N4ARWL';
const UPLOAD_URL = 'https://otheve.beacon.qq.com/analytics/v2_upload';

function readDeviceId(file) {
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  } catch {
    // 首次启动再生成设备标识。
  }
  const created = randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${created}\n`, { mode: 0o600 });
  return created;
}

function buildUploadBody({ appKey = DATONG_APP_KEY, deviceId, eventCode, mapValue = {}, now = Date.now(), appVersion = '0.1.1' } = {}) {
  const values = {};
  for (const [key, value] of Object.entries(mapValue)) values[key] = String(value ?? '');
  return {
    appVersion,
    sdkId: 'js',
    sdkVersion: '4.7.6-api',
    platformId: 3,
    mainAppKey: appKey,
    common: { A2: String(deviceId || '') },
    events: [{
      eventCode: String(eventCode || ''),
      eventTime: String(now),
      mapValue: values
    }]
  };
}

async function reportDatongEvent({
  eventCode,
  mapValue,
  userDataDir,
  fetchImpl = globalThis.fetch,
  appKey = DATONG_APP_KEY,
  now
} = {}) {
  if (!appKey || typeof fetchImpl !== 'function') return { ok: false };
  const deviceId = readDeviceId(path.join(userDataDir || process.cwd(), 'datong-device-id'));
  const body = buildUploadBody({ appKey, deviceId, eventCode, mapValue, now });
  const response = await fetchImpl(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    body: JSON.stringify(body)
  });
  return { ok: Boolean(response?.ok), body };
}

function reportAppStart(options = {}) {
  return reportDatongEvent({ ...options, eventCode: 'app_start', mapValue: { surface: 'desktop' } })
    .catch(() => ({ ok: false }));
}

module.exports = {
  DATONG_APP_KEY,
  UPLOAD_URL,
  readDeviceId,
  buildUploadBody,
  reportDatongEvent,
  reportAppStart
};
