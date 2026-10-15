const test = require('node:test');
const assert = require('node:assert/strict');
const { autoStrikeScore, autoStrikeImpact, decorateAutoStrikeCards, draftImpactMessage, isIronclad } = require('../knowledge/auto-strike');

const hellraiser = { id: 'HELLRAISER', name: '地狱狂徒' };
const pommel = { id: 'POMMEL_STRIKE', name: '剑柄打击' };
const defend = { id: 'DEFEND_IRONCLAD', name: '防御' };
const shrug = { id: 'SHRUG_IT_OFF', name: '耸肩无视' };
const primal = { id: 'PRIMAL_FORCE', name: '原始力量' };
const anger = { id: 'ANGER', name: '愤怒' };
const ironWave = { id: 'IRON_WAVE', name: '铁斩波' };

test('重复剑柄打击的流派增量递减，并与地狱狂徒形成协同', () => {
  const base = [hellraiser, ...Array(18).fill(defend)];
  const first = autoStrikeImpact(base, [], pommel).deltaPoints;
  const second = autoStrikeImpact([...base, pommel], [], pommel).deltaPoints;
  const third = autoStrikeImpact([...base, pommel, pommel], [], pommel).deltaPoints;
  assert.ok(first > second && second > third && third > 0);
  assert.ok(first > autoStrikeImpact([defend, ...Array(18).fill(defend)], [], pommel).deltaPoints);
  assert.equal(autoStrikeImpact(base, [], pommel).reason, '循环');
});

test('升级、遗物和牌组厚度改变同一候选的增量', () => {
  const base = [hellraiser, pommel, ...Array(18).fill(defend)];
  const normal = autoStrikeImpact(base, [], pommel).deltaPoints;
  const upgraded = autoStrikeImpact(base, [], { ...pommel, name: '剑柄打击+', upgraded: true }).deltaPoints;
  const withRelic = autoStrikeImpact(base, [{ id: 'STRIKE_DUMMY' }], pommel).deltaPoints;
  const thicker = autoStrikeScore([...base, ...Array(10).fill(defend)], []);
  assert.ok(upgraded > normal);
  assert.ok(withRelic >= normal);
  assert.ok(thicker < autoStrikeScore(base, []));
});

test('非套路牌只交稀释税，未知卡不猜测', () => {
  const base = [hellraiser, pommel, ...Array(18).fill(defend)];
  const filler = autoStrikeImpact(base, [], ironWave);
  assert.ok(filler.deltaPoints <= 0);
  assert.equal(filler.reason, '稀释');
  assert.ok(autoStrikeImpact(base, [], defend).deltaPoints <= 0);
  assert.equal(autoStrikeImpact(base, [], { id: 'UNKNOWN_MOD_CARD' }), null);
  assert.equal(isIronclad('ironclad'), true);
  assert.equal(isIronclad('铁甲战士'), true);
  assert.equal(isIronclad('silent'), false);
});

test('耸肩无视在有启动循环时为正分过牌辅助', () => {
  const base = [hellraiser, pommel, ...Array(12).fill(defend)];
  const impact = autoStrikeImpact(base, [], shrug);
  assert.ok(impact.deltaPoints > 0, `expected shrug > 0, got ${impact.deltaPoints}`);
  assert.equal(impact.reason, '过牌辅助');
});

test('硬毒牌比无关填充大幅更负', () => {
  const base = [hellraiser, pommel, pommel, { id: 'PILLAGE' }, ...Array(10).fill(defend)];
  const poison = autoStrikeImpact(base, [], primal);
  const filler = autoStrikeImpact(base, [], ironWave);
  assert.ok(poison.deltaPoints <= -10, `expected poison <= -10, got ${poison.deltaPoints}`);
  assert.ok(poison.deltaPoints < filler.deltaPoints - 5);
  assert.equal(poison.reason, '破坏循环');
});

test('软反牌带支线冲突标签且为负', () => {
  const base = [hellraiser, pommel, ...Array(12).fill(defend)];
  const impact = autoStrikeImpact(base, [], anger);
  assert.ok(impact.deltaPoints < 0);
  assert.equal(impact.reason, '支线冲突');
});

test('打击包弹药在有狂徒时小正，坚定不移与痛击不抬辅助', () => {
  const base = [hellraiser, pommel, ...Array(10).fill(defend)];
  const twin = autoStrikeImpact(base, [], { id: 'TWIN_STRIKE' });
  assert.ok(twin.deltaPoints > 0, `expected twin ammo > 0, got ${twin.deltaPoints}`);
  assert.equal(twin.reason, '弹药');
  const unmovable = autoStrikeImpact(base, [], { id: 'UNMOVABLE' });
  assert.ok(unmovable.deltaPoints <= 0);
  const bash = autoStrikeImpact(base, [], { id: 'BASH' });
  assert.ok(bash.deltaPoints <= 0);
});

test('原始奖励事件可在推荐完成前显示三张牌的增量', () => {
  const deck = [hellraiser, ...Array(19).fill(defend)];
  const offered = [pommel, { id: 'PILLAGE', name: '劫掠' }, anger];
  const decorated = decorateAutoStrikeCards('ironclad', deck, [], offered);
  assert.equal(decorated.length, 3);
  assert.ok(decorated.every(card => card.archetypeImpact?.id === 'auto_strike'));
  assert.ok(decorated[0].archetypeImpact.deltaPoints > decorated[1].archetypeImpact.deltaPoints);
  assert.equal(offered[0].archetypeImpact, undefined);
  assert.equal(decorateAutoStrikeCards('silent', deck, [], offered), offered);
  const event = { name: 'card.reward.opened', data: { signature: 'POMMEL_STRIKE:False|PILLAGE:False|ANGER:False' } };
  const message = draftImpactMessage(event, 'ironclad', decorated);
  assert.equal(message.type, 'draft_impact');
  assert.equal(message.signature, event.data.signature);
  assert.deepEqual(message.impacts.map(impact => impact.cardId), offered.map(card => card.id));
  assert.ok(message.impacts.every(impact => typeof impact.reason === 'string'));
  assert.equal(draftImpactMessage(event, 'silent', decorated), null);
  assert.equal(draftImpactMessage({ name: 'card.reward.opened', data: {} }, 'ironclad', decorated), null);
});
