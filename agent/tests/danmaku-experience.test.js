'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RunMemory } = require('../danmaku/run-memory');
const { DanmakuBridgeAdapter } = require('../danmaku/bridge-adapter');
const { DanmakuDirector } = require('../danmaku/director');
const { DanmakuLlmAtmosphere } = require('../danmaku/llm-atmosphere');
const settle = () => new Promise(resolve => setImmediate(resolve));
const state = ({ turn = 1, hp = 60, character = 'ironclad', enemies, cards = [], combat = true } = {}) => ({
  run: { runId: 'mod-run', act: 1, floor: 1, character, room: combat ? 'combat' : 'map' },
  player: { hp, maxHp: 80, energy: 3, block: 0, cards },
  combat: combat ? { turn, enemies: enemies || [{ id: 'NIBBIT', name: '小啃兽', hp: 20, maxHp: 20, intent: 'AttackIntent', alive: true }] } : null
});
const obs = (sequence, state) => ({ schema: 'gamebuddy.observation.v1', sequence, fresh: true, state });

 test('memory detects five evidenced highlights without repeating snapshots or attributing effects', () => {
  let now = 0;
  const m = new RunMemory({ now: () => now });
  const observe = input => m.observe(input, { runId: 'r', sceneId: 's' });
  observe(state({ hp: 12 }));
  now += 1000;
  observe(state({ hp: 10, turn: 2 }));
  observe(state({ hp: 10, turn: 2 }));
  assert.equal(m.pending().filter(item => item.kind === 'low_hp_survived').length, 1);
  const enemy = { id: 'NIBBIT', name: '小啃兽', hp: 3, maxHp: 20, intent: 'BuffIntent' };
  let input = state({ turn: 3, enemies: [enemy] }); observe(input);
  for (let i = 0; i < 3; i++) m.event({ name: 'card.played', eventId: `p${i}`, data: { cardName: '打击' } }, input);
  observe(input);
  assert.ok(m.pending().some(item => item.kind === 'near_finish'));
  observe(state({ turn: 4, enemies: [enemy] }));
  assert.ok(m.moments.some(item => item.kind === 'repeated_buff' && /意图/.test(item.text)));
  observe(state({ turn: 6, enemies: [enemy] }));
  observe(state({ turn: 6, enemies: [{ ...enemy, hp: 0, alive: false }] }));
  assert.ok(m.moments.some(item => item.kind === 'long_fight_down'));
  input = state({ turn: 7, cards: [{ id: 'NEW', name: '新卡' }] }); observe(input);
  m.event({ name: 'card.played', eventId: 'first-new', data: { cardId: 'NEW' } }, input);
  m.event({ name: 'card.played', eventId: 'first-new', data: { cardId: 'NEW' } }, input);
  assert.equal(m.moments.filter(item => item.kind === 'new_card_debut').length, 1);
  assert.match(m.moments.find(item => item.kind === 'new_card_debut').text, /收益尚未确认/);
});

test('missing deaths, missing play events and initial deck cannot manufacture highlights', () => {
  const m = new RunMemory();
  const observe = input => m.observe(input, { runId: 'r', sceneId: 's' });
  observe(state({ turn: 6, cards: [{ id: 'EXISTING', name: '旧卡' }] }));
  observe(state({ turn: 7, enemies: [] }));
  m.event({ name: 'card.played', eventId: 'old', data: { cardId: 'EXISTING' } }, state());
  assert.equal(m.pending().length, 0);
  m.disconnect();
  observe(state({ turn: 9, hp: 10 }));
  assert.equal(m.pending().length, 0, 'disconnect must not infer a turn transition');
});

test('run memory recalls relevant encounters and recovery, and isolates runs and characters', () => {
  const m = new RunMemory();
  m.observe(state({ hp: 10 }), { runId: 'r', sceneId: 'one', entering: true });
  m.observe(state({ hp: 50, combat: false }), { runId: 'r' });
  m.observe(state({ hp: 50 }), { runId: 'r', sceneId: 'two', entering: true });
  const memories = m.relevant(state()).join(' ');
  assert.match(memories, /第2次/); assert.match(memories, /此前包含小啃兽/); assert.match(memories, /恢复/);
  m.observe(state(), { runId: 'new-run', sceneId: 'new', entering: true });
  assert.deepEqual(m.relevant(state()), []);
  m.observe(state({ hp: 10 }), { runId: 'new-run', sceneId: 'new' });
  m.observe(state({ character: 'regent' }), { runId: 'new-run', sceneId: 'regent', entering: true });
  assert.deepEqual(m.relevant(state({ character: 'regent' })), []);
  for (let i = 0; i < 100; i++) m.addMoment('test', `event ${i}`, `${i}`);
  assert.ok(m.history.length <= 40 && m.moments.length <= 12);
});

test('ready skills and advice preempt AI while second AI waits at least six seconds after first display', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 }; d.setContext(scope);
  const queue = (id, source, texts, meta = {}) => d.burst({ ...scope, eventId: id, trigger: id, key: id, priority: 3,
    factTexts: texts, factSourceByText: Object.fromEntries(texts.map(text => [text, { source }])), ...meta });
  queue('ai', 'ai', ['第一条评论', '第二条评论']);
  assert.equal(d.tick()[0].text, '第一条评论');
  now = 1000; queue('skill', 'monster_skill', ['独立技能']); queue('advice', 'recommendation', ['重要建议']);
  assert.equal(d.tick()[0].text, '重要建议');
  now = 1500; assert.equal(d.tick()[0].text, '独立技能');
  now = 5999; assert.deepEqual(d.tick(), []);
  now = 6000; assert.equal(d.tick()[0].text, '第二条评论');
});

test('highlight preempts ordinary commentary and quiet messages stay thirty seconds apart', () => {
  let now = 0;
  const d = new DanmakuDirector({ now: () => now });
  const scope = { runId: 'r', sceneId: 's', stateRevision: 1 }; d.setContext(scope);
  const queue = (id, text, commentary) => d.burst({ ...scope, eventId: id, trigger: id, key: id, priority: 3,
    factTexts: [text], factSourceByText: { [text]: { source: 'ai' } }, commentaryByText: { [text]: commentary } });
  queue('ordinary', '普通评论', {}); queue('highlight', '精彩评论', { momentId: 'moment' });
  assert.equal(d.tick()[0].text, '精彩评论');
  now = 6000; assert.equal(d.tick()[0].text, '普通评论');
  now = 12000; queue('quiet', '安静评论一', { quiet: true }); assert.equal(d.tick()[0].text, '安静评论一');
  now = 27000; queue('quiet-two', '安静评论二', { quiet: true }); assert.deepEqual(d.tick(), []);
  now = 42000; assert.equal(d.tick()[0].text, '安静评论二');
});

test('adapter drops queued second line when its target dies and exposes visible skill identity', async () => {
  let now = 0;
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: async () => ({ status: 'generated', phrases: ['第一句针对怪物', '第二句针对怪物'] }) } });
  await adapter.ingestObservation(obs(1, state()), { runId: 'r' }); await settle();
  assert.match(adapter.director.queue.find(item => item.source === 'monster_skill').skillLabel, /小啃兽/);
  adapter.tick(); // skill first
  now = 500; assert.equal(adapter.tick()[0].text, '第一句针对怪物');
  await adapter.ingestObservation(obs(2, state({ enemies: [] })), { runId: 'r' });
  now = 6500; assert.deepEqual(adapter.tick(), []);
  assert.equal(adapter.director.queue.some(item => item.text === '第二句针对怪物'), false);
});

test('quiet battle still requests on cadence but reduces presentation; highlights enter real model context', async () => {
  let now = 0; const contexts = [];
  const adapter = new DanmakuBridgeAdapter({ now: () => now, llmAtmosphere: { generate: async context => {
    contexts.push(context); const i = contexts.length;
    return { status: 'generated', phrases: [`第${i}批观察一句`, `第${i}批观察二句`] };
  } } });
  await adapter.ingestObservation(obs(1, state({ hp: 10 })), { runId: 'r' }); await settle();
  now = 15000; adapter.tick(); await settle();
  assert.equal(contexts.length, 2); assert.equal(contexts[1].mode, 'quiet');
  assert.equal(adapter.director.queue.filter(item => /第2批/.test(item.text)).length, 1);
  now = 30000; adapter.tick(); await settle();
  assert.equal(contexts.length, 3); assert.equal(adapter.director.queue.filter(item => /第3批/.test(item.text)).length, 0);
  await adapter.ingestObservation(obs(2, state({ hp: 9, turn: 2 })), { runId: 'r' });
  now = 45000; adapter.tick(); await settle();
  assert.equal(contexts[3].mode, 'highlight');
  assert.equal(contexts[3].moments[0].kind, 'low_hp_survived');
});

test('model receives perspective and memory, validates references and keeps historical highlight identity', async () => {
  let payload;
  const model = new DanmakuLlmAtmosphere({ llm: { enabled: true, completeDanmaku: async input => {
    payload = input;
    return { phrases: [
      { text: '刚才那场交锋很漫长。', momentId: 'm1', enemyKeys: [] },
      { text: '这个怪物不该被捏造。', enemyKeys: ['unknown'] },
      { text: '眼前这只还在准备。', enemyKeys: ['小啃兽#0'] }
    ] };
  } } });
  const result = await model.generate({ character: 'silent', moments: [{ id: 'm1', kind: 'long_fight_down', text: '敌人倒下' }],
    runMemories: ['本局再次遇到小啃兽'], snapshot: { enemies: [{ key: '小啃兽#0', name: '小啃兽' }] } });
  assert.ok(payload.attention.length); assert.match(payload.memoryVoice, /猎人/);
  assert.ok(payload.reactions.long_fight_down); assert.equal(payload.runMemories.length, 1);
  assert.equal(result.phrases.length, 2);
  assert.equal(result.commentaryByText[result.phrases[0]].momentId, 'm1');
  assert.deepEqual(result.commentaryByText[result.phrases[1]].enemyKeys, ['小啃兽#0']);
});

test('only fresh same-run live card facts contribute to first-play memory', async () => {
  let now = 10000;
  const adapter = new DanmakuBridgeAdapter({ now: () => now });
  await adapter.ingestObservation(obs(1, state({ combat: false })), { runId: 'r' });
  const input = state({ cards: [{ id: 'NEW', name: '新牌' }] });
  await adapter.ingestObservation(obs(2, input), { runId: 'r' });
  const fact = { eventId: 'f', eventType: 'card.played', runId: 'mod-run', occurredAt: now, payload: { cardId: 'NEW' } };
  await adapter.ingestFact({ ...fact, runId: 'other' });
  await adapter.ingestFact({ ...fact, occurredAt: 1 });
  await adapter.ingestFact(fact, { replay: true });
  assert.equal(adapter.memory.pending().length, 0);
  await adapter.ingestFact(fact); await adapter.ingestFact(fact);
  assert.equal(adapter.memory.pending().length, 1);
  assert.equal(adapter.memory.pending()[0].kind, 'new_card_debut');
});


test('adding another copy cannot claim that an indistinguishable old copy was the new card debut', () => {
  const m = new RunMemory();
  const card = { id: 'STRIKE', name: '打击' };
  m.observe(state({ cards: [card] }), { runId: 'r', sceneId: 's' });
  const input = state({ cards: [card, card] });
  m.observe(input, { runId: 'r', sceneId: 's' });
  m.event({ name: 'card.played', eventId: 'copy', data: { cardId: 'STRIKE' } }, input);
  assert.equal(m.pending().length, 0);
});

test('historical highlights expire and never survive into another combat scene', () => {
  let now = 0;
  const m = new RunMemory({ now: () => now });
  m.observe(state(), { runId: 'r', sceneId: 's' });
  m.addMoment('long_fight_down', '已观察到敌人倒下。', 'death');
  const id = m.pending()[0].id;
  assert.equal(m.validMoment(id), true);
  now = 60_000;
  assert.equal(m.validMoment(id), false);
  m.addMoment('low_hp_survived', '低生命进入下一回合。', 'survive');
  const other = m.pending()[0].id;
  m.observe(state(), { runId: 'r', sceneId: 'next', entering: true });
  assert.equal(m.validMoment(other), false);
});


test('authoritative Mod run change clears memories even when a caller reuses its run key', async () => {
  const adapter = new DanmakuBridgeAdapter();
  await adapter.ingestObservation(obs(1, state({ hp: 10 })), { runId: 'reused-seed' });
  const oldScene = adapter.scope.sceneId;
  assert.ok(adapter.memory.history.length);
  const input = state(); input.run.runId = 'different-mod-run';
  await adapter.ingestObservation(obs(2, input), { runId: 'reused-seed' });
  assert.notEqual(adapter.scope.sceneId, oldScene);
  assert.equal(adapter.memory.history.length, 0);
});
