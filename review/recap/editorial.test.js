const test = require('node:test');
const assert = require('node:assert/strict');
const { makeTimeline } = require('./facts');
const { candidateDiagnostics, selectStories } = require('./stories');

const facts = [{ eventId: 'e', eventType: 'run.observed', runId: 'r', sourceSessionId: 's', sourceSeq: 1,
  payload: { hp: 28, maxHp: 80, totalFloor: 17, combat: { enemies: [{ hp: 1, name: '灵魂异鱼' }], turn: 10 } } }];
const t = makeTimeline('r', facts);
const candidate = { title: '异鱼先把血条藏起来了', bodyTemplate: '灵魂异鱼只剩{{enemy}}血，你还剩{{hp}}血，双方都在等最后一击。',
  evidenceIds: ['unknown_optional_reference'], bindings: { enemy: { claimIndex: 0 }, hp: { claimIndex: 1 } },
  assertions: [{ type: 'event_field', eventId: 'e', field: 'combat.enemies.0.hp', value: 1 },
    { type: 'event_field', eventId: 'e', field: 'hp', value: 28 }, { type: 'entity_name', subjectId: 'unknown', value: '灵魂异鱼' }] };
const diagnose = value => candidateDiagnostics(t, [value], { preserveModelVoice: true })[0];

test('supported numbers survive missing name lookup and optional reference', () => {
  assert.equal(diagnose(candidate).accepted, true);
});

test('a long readable story retains the model wording', () => {
  const title = '血条都快见底，谁都没从这场对峙里先退开';
  const bodyTemplate = candidate.bodyTemplate + '刀还悬在半空，药瓶也空着，屏幕前的人跟着一起憋气。那种感觉就像下楼梯时脚下突然踏空，心里还在盘算刚才那张牌打得值不值。';
  const [card] = selectStories(t, [{ ...candidate, title, bodyTemplate }], { preserveModelVoice: true });
  assert.equal(card?.title, title);
  assert.ok(card.body.endsWith('值不值。'));
});

test('body numbers and numeric string bindings do not gate publication', () => {
  const assertions = candidate.assertions.map((claim, index) => index === 1 ? { ...claim, value: '29' } : claim);
  const [card] = selectStories(t, [{ ...candidate, assertions }], { preserveModelVoice: true });
  assert.match(card.body, /你还剩29血/);
  assert.equal(diagnose({ ...candidate, bodyTemplate: '第17层，他只剩8血，却打了34点伤害。' }).accepted, true);
});

test('engineering jargon and definite counterfactual victory are rejected', () => {
  assert.equal(diagnose({ ...candidate, bodyTemplate: '它准备StatusIntent' }).reason, 'unreadable_wording');
  assert.equal(diagnose({ ...candidate, bodyTemplate: '这场本来可以赢。' }).reason, 'unsupported_counterfactual_wording');
});

test('titles allow natural numbers and reject exact combat reports', () => {
  for (const title of ['两瓶药陪我到墓门口，一路看戏', '第17层，药瓶还等着我说请', '第十回合', '52金币换了个教训', '三加四，金币大逃亡', '两瓶药没喝，到了第17层还在等一个值得开瓶的日子']) {
    const [card] = selectStories(t, [{ ...candidate, title }], { preserveModelVoice: true });
    assert.equal(card?.title, title);
  }
  for (const title of ['异鱼只剩1血', '只剩１血', '四十六血掉到八血', '血量从46掉到8', 'HP 80→20', '打了34点伤害', '三十四点伤害', '实际抗伤47', '伤害：1,200', '只挨了34点']) {
    assert.equal(diagnose({ ...candidate, title }).reason, 'combat_value_in_title', title);
  }
});
