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
assert.match(html, /关底 BOSS/);
const killerHtml = window.GameBuddyReviewUi.render({
  ...dashboard,
  recentRuns: [{ character: 'ironclad', result: 'loss', encounterKind: 'killer', bossName: '猫头鹰法官', floor: 39, maxTurnDamage: 10 }]
});
assert.match(killerHtml, /死于/);
assert.match(killerHtml, /猫头鹰法官/);
assert.match(killerHtml, /39 层/);
assert.doesNotMatch(killerHtml, /关底 BOSS/);
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
assert.match(unknownAxis,/等待精英挑战数据/);assert.doesNotMatch(unknownAxis,/再完成 0 局/);
const universalHtml=window.GameBuddyReviewUi.render({...dashboard,sampleSize:3,mainCharacterSampleSize:2});
assert.match(universalHtml,/全角色 · 最近 3 局/);assert.match(universalHtml,/2<small>局使用/);
assert.equal((universalHtml.match(/review-radar-data/g)||[]).length,1);
const abandonedHtml=window.GameBuddyReviewUi.render({...dashboard,window:{wins:1,losses:1,abandoned:1},recentRuns:[{result:'abandoned',character:'ironclad',runId:'quit'}]});
assert.match(abandonedHtml,/review-result abandoned">放弃/);assert.match(abandonedHtml,/放弃 1 局/);assert.doesNotMatch(abandonedHtml,/review-result loss/);
const countHtml=window.GameBuddyReviewUi.render({...dashboard,stats:[{id:'maxWinStreak',kind:'count',label:'最多连胜',value:3,sampleSize:50}]});
assert.match(countHtml,/最多连胜/);assert.match(countHtml,/3<small> 连胜/);assert.doesNotMatch(countHtml,/3%|width:3%/);

const hostileName = '打击<script>"&';
const buildDashboard = {
  ...dashboard,
  recentRuns: [
    {
      runId: 'alpha"run',
      character: 'ironclad',
      result: 'win',
      bossName: '守护者',
      floor: 55,
      maxTurnDamage: 128,
      deck: [
        { id: 'STRIKE', name: hostileName, upgraded: false },
        { id: 'STRIKE', name: hostileName, upgraded: true },
        { id: 'DEFEND', name: '防御', upgraded: false }
      ],
      relics: [{ id: 'ANCHOR', name: '锚<img>' }]
    },
    {
      runId: 'beta',
      character: 'silent',
      result: 'loss',
      bossName: '史莱姆',
      floor: 17,
      maxTurnDamage: 40,
      deck: [{ id: 'DAGGER', name: '匕首雨', upgraded: true }],
      relics: [{ id: 'RING', name: '蛇戒' }]
    },
    {
      runId: 'empty-build',
      character: 'defect',
      result: 'loss',
      bossName: '守卫',
      floor: 3,
      maxTurnDamage: 0,
      deck: [],
      relics: []
    },
    {
      runId: 'legacy',
      character: 'ironclad',
      result: 'abandoned',
      bossName: '未知首领',
      floor: 1,
      maxTurnDamage: null,
      deck: null,
      relics: null
    }
  ]
};

const collapsed = window.GameBuddyReviewUi.render(buildDashboard, null);
assert.match(collapsed, /role="button"/);
assert.match(collapsed, /data-run-id="alpha&quot;run"/);
assert.match(collapsed, /aria-expanded="false"/);
assert.match(collapsed, /aria-controls="review-run-build-0"/);
assert.match(collapsed, /aria-controls="review-run-build-1"/);
assert.doesNotMatch(collapsed, /review-run-build"/);
assert.doesNotMatch(collapsed, /终局牌组/);
assert.doesNotMatch(collapsed, /匕首雨/);

const alphaHtml = window.GameBuddyReviewUi.render(buildDashboard, 'alpha"run');
assert.match(alphaHtml, /data-run-id="alpha&quot;run"[^>]*aria-expanded="true"[^>]*aria-controls="review-run-build-0"/);
assert.match(alphaHtml, /id="review-run-build-0"/);
assert.match(alphaHtml, /data-run-id="beta"[^>]*aria-expanded="false"/);
assert.match(alphaHtml, /终局牌组/);
assert.match(alphaHtml, /终局遗物/);
assert.match(alphaHtml, /3 张/);
assert.match(alphaHtml, /1 件/);
assert.equal((alphaHtml.match(/review-card-chip/g) || []).length, 3);
assert.equal((alphaHtml.match(/review-card-upgrade/g) || []).length, 1);
assert.match(alphaHtml, /打击&lt;script&gt;&quot;&amp;/);
assert.match(alphaHtml, /锚&lt;img&gt;/);
assert.doesNotMatch(alphaHtml, /打击<script>/);
assert.doesNotMatch(alphaHtml, /匕首雨/);
assert.doesNotMatch(alphaHtml, /蛇戒/);
assert.doesNotMatch(alphaHtml, /本局没有记录到遗物/);
assert.doesNotMatch(alphaHtml, /旧记录未包含此数据/);

const betaHtml = window.GameBuddyReviewUi.render(buildDashboard, 'beta');
assert.match(betaHtml, /匕首雨/);
assert.match(betaHtml, /蛇戒/);
assert.match(betaHtml, /aria-label="已升级">\+<\/span>/);
assert.doesNotMatch(betaHtml, /打击&lt;script&gt;/);
assert.doesNotMatch(betaHtml, /锚&lt;img&gt;/);
assert.match(betaHtml, /data-run-id="beta"[^>]*aria-expanded="true"[^>]*aria-controls="review-run-build-1"/);
assert.match(betaHtml, /id="review-run-build-1"[^>]*data-run-id="beta"/);

const emptyHtml = window.GameBuddyReviewUi.render(buildDashboard, 'empty-build');
assert.match(emptyHtml, /本局没有记录到牌组/);
assert.match(emptyHtml, /本局没有记录到遗物/);
assert.match(emptyHtml, /0 张/);
assert.match(emptyHtml, /0 件/);
assert.doesNotMatch(emptyHtml, /旧记录未包含此数据/);

const legacyHtml = window.GameBuddyReviewUi.render(buildDashboard, 'legacy');
assert.equal((legacyHtml.match(/旧记录未包含此数据/g) || []).length, 2);
assert.doesNotMatch(legacyHtml, /本局没有记录到牌组/);
assert.doesNotMatch(legacyHtml, /本局没有记录到遗物/);

const idFallback = window.GameBuddyReviewUi.render({
  ...buildDashboard,
  recentRuns: [{
    runId: 'ids-only',
    character: 'ironclad',
    result: 'win',
    bossName: '守护者',
    floor: 2,
    maxTurnDamage: 1,
    deck: [{ id: 'STRIKE_R', name: '', upgraded: false }],
    relics: [{ id: 'BURNING_BLOOD', name: '' }]
  }]
}, 'ids-only');
assert.match(idFallback, /STRIKE_R/);
assert.match(idFallback, /BURNING_BLOOD/);

assert.match(html, /id="review-open-leaderboard">排行榜/);

const leaderboardItems = [
  {
    runId: 'slow-run-hidden',
    displayName: '慢<script>"&',
    observedDurationSeconds: 4000,
    combatSaveLoad: true,
    finalDeck: [{ id: 'CARD<img>', upgraded: true }],
    finalRelics: [{ id: 'RELIC"&' }],
    selectedEvents: [{ eventId: 'E<script>', pageId: 'P"&', optionId: 'O' }],
    playerId: 'pid-hide-slow',
    createdAt: 'secret-created'
  },
  {
    runId: 'fast-run-hidden',
    displayName: '   ',
    observedDurationSeconds: 5,
    combatSaveLoad: false,
    finalDeck: [],
    finalRelics: [],
    selectedEvents: [],
    playerId: 'pid-hide-fast'
  },
  {
    runId: 'odd-run',
    displayName: '',
    observedDurationSeconds: 1.5,
    combatSaveLoad: 'yes',
    finalDeck: null,
    finalRelics: null,
    selectedEvents: null,
    playerId: 'pid-hide-odd'
  }
];
const filters = { character: 'silent', ascension: '10', gameMode: 'Daily' };
const board = window.GameBuddyReviewUi.renderLeaderboard({
  filters,
  status: 'success',
  items: leaderboardItems,
  expandedRunId: 'slow-run-hidden',
  filterError: ''
});
const slowRank = board.indexOf('leaderboard-rank">1<');
const slowName = board.indexOf('leaderboard-name">慢&lt;script&gt;&quot;&amp;');
const fastRank = board.indexOf('leaderboard-rank">2<');
const fastName = board.indexOf('leaderboard-name">匿名人士');
assert.ok(slowRank !== -1 && slowRank < slowName && slowName < fastRank && fastRank < fastName);
assert.match(board, /01:06:40/);
assert.match(board, /00:05/);
assert.match(board, /有战斗内读档/);
assert.match(board, /无战斗内读档/);
assert.match(board, /未知/);
assert.match(board, /终局牌组/);
assert.match(board, /终局遗物/);
assert.match(board, /事件选择/);
assert.match(board, /CARD&lt;img&gt;/);
assert.match(board, /RELIC&quot;&amp;/);
assert.match(board, /E&lt;script&gt; \/ P&quot;&amp; \/ O/);
assert.match(board, /aria-label="已升级">\+/);
assert.doesNotMatch(board, /慢<script>/);
assert.doesNotMatch(board, /CARD<img>/);
assert.doesNotMatch(board, /pid-hide-slow|pid-hide-fast|pid-hide-odd/);
assert.equal(board.split('slow-run-hidden').length, 2);
assert.equal(board.split('fast-run-hidden').length, 2);
assert.doesNotMatch(board, /secret-created/);
assert.match(board, /<option value="silent" selected>静默猎手<\/option>/);
assert.match(board, /<option value="Daily" selected>每日<\/option>/);
assert.match(board, /min="0"/);
assert.match(board, /max="10000"/);
assert.match(board, /step="1"/);
assert.match(board, /value="10"/);
assert.match(board, /返回个人数据/);
assert.doesNotMatch(board, /无记录/);

const collapsedBoard = window.GameBuddyReviewUi.renderLeaderboard({
  filters: { character: 'ironclad', ascension: '0', gameMode: 'Standard' },
  status: 'success',
  items: [leaderboardItems[1]],
  expandedRunId: null
});
assert.doesNotMatch(collapsedBoard, /终局牌组|事件选择/);
assert.match(collapsedBoard, /<option value="ironclad" selected>铁甲战士<\/option>/);
assert.match(collapsedBoard, /<option value="Standard" selected>标准<\/option>/);

const emptyDetail = window.GameBuddyReviewUi.renderLeaderboard({
  filters: { character: 'ironclad', ascension: '0', gameMode: 'Standard' },
  status: 'success',
  items: [leaderboardItems[1]],
  expandedRunId: 'fast-run-hidden'
});
assert.equal((emptyDetail.match(/无记录/g) || []).length, 3);

const loadingBoard = window.GameBuddyReviewUi.renderLeaderboard({
  filters: { character: 'ironclad', ascension: '0', gameMode: 'Standard' },
  status: 'loading',
  items: leaderboardItems,
  filterError: ''
});
assert.match(loadingBoard, /正在读取排行榜…/);
assert.match(loadingBoard, /id="leaderboard-submit" disabled/);
assert.doesNotMatch(loadingBoard, /pid-hide-slow/);
assert.match(loadingBoard, /id="leaderboard-character"/);

const emptyBoard = window.GameBuddyReviewUi.renderLeaderboard({
  filters: { character: 'regent', ascension: '0', gameMode: 'Custom' },
  status: 'empty',
  items: []
});
assert.match(emptyBoard, /当前条件下暂无排行记录/);
assert.match(emptyBoard, /<option value="Custom" selected>自定义<\/option>/);
assert.match(emptyBoard, /故障机器人/);
assert.match(emptyBoard, /死灵法师/);

const errorBoard = window.GameBuddyReviewUi.renderLeaderboard({
  filters: { character: 'ironclad', ascension: '"><script>', gameMode: 'Standard' },
  status: 'error',
  filterError: 'ascension'
});
assert.match(errorBoard, /排行榜读取失败/);
assert.match(errorBoard, /id="leaderboard-retry">重试/);
assert.match(errorBoard, /请修正筛选条件。进阶需为 0 到 10000 的整数。/);
assert.match(errorBoard, /value="&quot;&gt;&lt;script&gt;"/);
assert.doesNotMatch(errorBoard, /"><script>/);

console.log('Review UI tests passed.');
