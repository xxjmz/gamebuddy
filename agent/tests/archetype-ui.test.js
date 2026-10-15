const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeHtml,
  buildStatus,
  selectCardImpacts,
  renderOverview,
  renderCardImpacts
} = require('../../src/archetype-ui');

const scores = [
  { id: 'auto_strike', name: '自动打击流', score: 18 },
  { id: 'exhaust', name: '消耗引擎', score: 42 },
  { id: 'strength', name: '力量叠加', score: 12 },
  { id: 'block', name: '格挡壁垒', score: 7 }
];

test('主流派状态覆盖阈值、唯一最高、并列和未成型', () => {
  assert.deepEqual(buildStatus(scores), {
    kind: 'primary',
    label: '主流派 · 消耗引擎',
    archetypeIds: ['exhaust']
  });
  assert.equal(buildStatus(scores.map(item => ({ ...item, score: item.id === 'auto_strike' ? 42 : item.score }))).kind, 'mixed');
  assert.equal(buildStatus(scores.map(item => ({ ...item, score: 14 }))).kind, 'unformed');
  assert.equal(buildStatus(scores.map(item => ({ ...item, score: item.id === 'exhaust' ? 15 : 3 }))).kind, 'primary');
});

test('候选增量显式优先、绝对值降序、固定流派顺序且最多两条', () => {
  const selected = selectCardImpacts([
    { id: 'block', deltaPoints: -8, explicit: false },
    { id: 'strength', deltaPoints: 3, explicit: true },
    { id: 'exhaust', deltaPoints: -3, explicit: true },
    { id: 'auto_strike', deltaPoints: 9, explicit: false }
  ], scores);
  assert.deepEqual(selected.map(item => item.id), ['exhaust', 'strength']);
  assert.equal(selected.length, 2);
});

test('全是纯稀释时只显示当前最高流派的一条', () => {
  const selected = selectCardImpacts([
    { id: 'auto_strike', deltaPoints: -2, explicit: false },
    { id: 'exhaust', deltaPoints: -1, explicit: false },
    { id: 'strength', deltaPoints: -3, explicit: false },
    { id: 'block', deltaPoints: -1, explicit: false }
  ], scores);
  assert.deepEqual(selected.map(item => item.id), ['exhaust']);
});

test('流派 HTML 输出转义名称和原因', () => {
  const hostile = '<img src=x onerror="boom">&\'';
  assert.equal(escapeHtml(hostile), '&lt;img src=x onerror=&quot;boom&quot;&gt;&amp;&#39;');
  const overview = renderOverview([{ id: 'exhaust', name: hostile, score: 20 }]);
  const impacts = renderCardImpacts([
    { id: 'exhaust', name: hostile, deltaPoints: 2, explicit: true, reason: hostile }
  ], [{ id: 'exhaust', score: 20 }]);
  assert.doesNotMatch(overview, /<img/);
  assert.doesNotMatch(impacts, /<img/);
  assert.match(impacts, /&lt;img/);
  assert.match(impacts, /流派度≠胜率/);
});
