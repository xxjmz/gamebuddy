const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'review-ui.js'), 'utf8'),
  { window }
);

const dashboard = {
  mainCharacter: 'ironclad',
  sampleSize: 4,
  window: { total: 4, wins: 2, losses: 1, abandoned: 1 },
  axes: [
    { label: '进攻出牌', value: 60 },
    { label: '拿牌克制', value: 70 },
    { label: '精英挑战', value: 80 },
    { label: '商店消费', value: 50 },
    { label: '火堆升级', value: 90 }
  ],
  stats: [{ id: 'winRate', label: '通关率', value: 66.7, numerator: 2, denominator: 3 }],
  recentRuns: [
    { character: 'ironclad', result: 'win', bossName: '守护者', floor: 55, maxTurnDamage: 128 },
    { character: 'silent', result: 'loss', bossName: null, floor: null, maxTurnDamage: null }
  ]
};

const html = window.GameBuddyReviewUi.render(dashboard);
assert.match(html, /主角色/);
assert.match(html, /玩法五星图/);
assert.match(html, /角色 · 通关状态 · BOSS · 楼层 · 单回合伤害/);
assert.match(html, /守护者/);
assert.match(html, /最高单回合伤害/);
assert.match(html, /128/);
assert.match(html, /未知/);
assert.doesNotMatch(html, /副角色/);
assert.doesNotMatch(html, /数据链路/);
assert.equal((html.match(/review-radar-data/g) || []).length, 1);

const insufficient = window.GameBuddyReviewUi.render({ ...dashboard, sampleSize: 2 });
assert.match(insufficient, /再完成 1 局即可生成五星图/);
assert.equal((insufficient.match(/review-radar-data/g) || []).length, 0);

const unknownAxis = window.GameBuddyReviewUi.render({
  ...dashboard,
  axes: dashboard.axes.map((axis, index) => index === 2 ? { ...axis, value: null } : axis)
});
assert.equal((unknownAxis.match(/review-radar-data/g) || []).length, 0);

console.log('Review UI tests passed.');
