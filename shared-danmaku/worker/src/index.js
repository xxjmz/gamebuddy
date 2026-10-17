const MAX_TEXT = 80;
const MAX_SCENE_KEY = 180;
const DAILY_SUBMISSIONS = 20;

const json = (body, status = 200, request) => new Response(status === 204 ? null : JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': request?.headers.get('origin') || '*',
    'access-control-allow-headers': 'content-type, x-gamebuddy-client',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'cache-control': 'no-store'
  }
});

function clean(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function validSceneKey(value) {
  const sceneKey = clean(value, MAX_SCENE_KEY);
  return sceneKey && /^[\p{Letter}\p{Number}_:+-]+$/u.test(sceneKey) ? sceneKey : '';
}

function validPhase(value) {
  return value === 'death' ? 'death' : value === 'combat' ? 'combat' : '';
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authorHash(request, env) {
  const client = clean(request.headers.get('x-gamebuddy-client'), 120) || 'anonymous';
  return sha256(`${env.SHARED_DANMAKU_SALT || 'change-me'}:${client}`);
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function listMessages(request, env) {
  const url = new URL(request.url);
  const sceneKey = validSceneKey(url.searchParams.get('sceneKey'));
  const phase = validPhase(url.searchParams.get('phase'));
  if (!sceneKey || !phase) return json({ error: 'sceneKey and phase are required' }, 400, request);
  const result = await env.DB.prepare(`
    SELECT id, scene_key AS sceneKey, phase, text, character, game_version AS gameVersion
    FROM shared_danmaku
    WHERE scene_key = ?1 AND phase = ?2 AND status = 'active' AND report_count < 3
    ORDER BY RANDOM()
  `).bind(sceneKey, phase).all();
  const items = result.results || [];
  if (items.length) {
    await env.DB.prepare(`
      UPDATE shared_danmaku
      SET served_count = served_count + 1
      WHERE scene_key = ?1 AND phase = ?2 AND status = 'active' AND report_count < 3
    `).bind(sceneKey, phase).run();
  }
  return json({ items }, 200, request);
}

async function createMessage(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400, request);
  }
  const sceneKey = validSceneKey(body?.sceneKey);
  const phase = validPhase(body?.phase);
  const text = clean(body?.text, MAX_TEXT);
  const character = clean(body?.character, 32);
  const gameVersion = clean(body?.gameVersion, 32);
  if (!sceneKey || !phase || !text) return json({ error: 'sceneKey, phase and text are required' }, 400, request);

  const author = await authorHash(request, env);
  const today = new Date().toISOString().slice(0, 10);
  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM shared_danmaku
    WHERE author_hash = ?1 AND created_day = ?2
  `).bind(author, today).first();
  if (Number(count?.count || 0) >= DAILY_SUBMISSIONS) {
    return json({ error: 'daily_limit_reached' }, 429, request);
  }
  const duplicate = await env.DB.prepare(`
    SELECT id FROM shared_danmaku
    WHERE author_hash = ?1 AND scene_key = ?2 AND phase = ?3 AND text = ?4 AND status = 'active'
    LIMIT 1
  `).bind(author, sceneKey, phase, text).first();
  if (duplicate?.id) return json({ error: 'duplicate_message' }, 409, request);

  const item = {
    id: randomId(), sceneKey, phase, text, character, gameVersion
  };
  await env.DB.prepare(`
    INSERT INTO shared_danmaku
      (id, scene_key, phase, text, character, game_version, author_hash, created_day, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `).bind(item.id, sceneKey, phase, text, character, gameVersion, author, today, Date.now()).run();
  return json({ item }, 201, request);
}

async function reportMessage(request, env, id) {
  const messageId = clean(id, 80);
  if (!messageId) return json({ error: 'missing_id' }, 400, request);
  const result = await env.DB.prepare(`
    UPDATE shared_danmaku
    SET report_count = report_count + 1,
        status = CASE WHEN report_count + 1 >= 3 THEN 'hidden' ELSE status END
    WHERE id = ?1 AND status = 'active'
  `).bind(messageId).run();
  return result.meta?.changes ? json({ accepted: true }, 200, request) : json({ error: 'not_found' }, 404, request);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({}, 204, request);
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true }, 200, request);
    if (url.pathname.startsWith('/v1/danmaku/') && request.method === 'POST' && url.pathname.endsWith('/report')) {
      const id = url.pathname.slice('/v1/danmaku/'.length, -'/report'.length);
      return await reportMessage(request, env, id);
    }
    if (url.pathname !== '/v1/danmaku') return json({ error: 'not_found' }, 404, request);
    try {
      if (request.method === 'GET') return await listMessages(request, env);
      if (request.method === 'POST') return await createMessage(request, env);
      return json({ error: 'method_not_allowed' }, 405, request);
    } catch (error) {
      console.error(error);
      return json({ error: 'server_error' }, 500, request);
    }
  }
};
