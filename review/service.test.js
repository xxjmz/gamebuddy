const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildDashboard, createReviewService, loadHistory } = require('./service');

function state(runId, character = 'ironclad', floor = 1, enemyHp = null, turn = 1) {
  return {
    timestamp: Date.now(),
    run: { runId, character, act: 1, floor, totalFloor: floor, nextBossId: 'THE_GUARDIAN', nextBoss: '守护者' },
    player: { hp: 70, maxHp: 80, gold: 99, cards: Array(12).fill({ id: 'STRIKE' }), relics: [], potions: [] },
    combat: enemyHp === null ? null : { turn, enemies: [{ hp: enemyHp }] }
  };
}

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-review-'));
const filePath = path.join(directory, 'history.json');
const service = createReviewService({ filePath, checkpointMs: 0 });

service.ingestState(state('run-1', 'ironclad', 1, 40, 1));
service.ingestEvent({ name: 'combat.started', data: { roomType: 'Elite' } });
service.ingestState(state('run-1', 'ironclad', 1, 24, 1));
service.ingestEvent({ name: 'card.played', data: { cardType: 'Attack' } });
service.ingestEvent({ name: 'card.reward.opened', data: {} });
service.ingestEvent({ name: 'card.reward.closed', data: { outcome: 'skipped' } });
service.ingestEvent({ name: 'rest.opened', data: {} });
service.ingestEvent({ name: 'rest.closed', data: { action: 'SMITH' } });
service.ingestEvent({ name: 'run.ended', data: { runId: 'run-1', result: 'win', floor: 55, bossName: '守护者' } });

let dashboard = service.getDashboard();
assert.equal(dashboard.window.wins, 1);
assert.equal(dashboard.mainCharacter, 'ironclad');
assert.equal(dashboard.recentRuns[0].maxTurnDamage, 16);
assert.equal(dashboard.recentRuns[0].bossName, '守护者');
assert.equal(dashboard.axes.find(axis => axis.id === 'attackPlay').value, 100);
assert.equal(dashboard.stats.find(stat => stat.id === 'campUpgrade').value, 100);

service.ingestState(state('run-2', 'silent', 3));
service.ingestState(state('run-3', 'ironclad', 1));
assert.equal(service.getHistory().runs.find(run => run.runId === 'run-2').result, 'abandoned');
service.ingestEvent({ name: 'run.ended', data: { runId: 'run-3', result: 'loss', floor: 1 } });

service.ingestState(state('same-id', 'silent', 2));
service.ingestEvent({ name: 'run.ended', data: { result: 'loss' } });
service.ingestState(state('same-id', 'silent', 2));
service.ingestEvent({ name: 'run.ended', data: { result: 'win' } });
assert.equal(service.getHistory().runs.filter(run => run.runId === 'same-id').length, 1);
assert.equal(service.getHistory().runs.find(run => run.runId === 'same-id').result, 'win');

for (let index = 0; index < 105; index += 1) {
  service.ingestState(state(`bulk-${index}`, 'defect', index % 55));
  service.ingestEvent({ name: 'run.ended', data: { result: 'loss' } });
}
assert.equal(service.getHistory().runs.length, 100);

service.flush();
fs.copyFileSync(filePath, `${filePath}.bak`);
fs.writeFileSync(filePath, '{bad json', 'utf8');
const recovered = loadHistory(filePath);
assert.match(recovered.recoveryWarning, /备份恢复/);
assert.equal(recovered.runs.length, 100);

service.clear();
dashboard = service.getDashboard();
assert.equal(dashboard.window.total, 0);
assert.equal(dashboard.axes.every(axis => axis.value === null), true);

const baseCounters = {
  combats: 1, normalCombats: 0, eliteEntries: 1, eliteWins: 1, bossEntries: 0,
  typedCardsPlayed: 1, attacksPlayed: 1,
  cardRewards: 1, cardsTaken: 0, rewardSkips: 1, unknownRewards: 0,
  shopsVisited: 1, knownGoldSpent: 100, unknownShopClosures: 0,
  restSites: 1, smiths: 1, heals: 0, otherKnownRestActions: 0, unknownRestActions: 0
};
const aggregate = buildDashboard({
  schema: 'gamebuddy.review-history.v1',
  runs: [
    { runId: 'recent-silent', character: 'silent', result: 'abandoned', initialDeckSize: 10, finalFloor: 10, finalAct: 1, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters },
    { runId: 'iron-win', character: 'ironclad', result: 'win', initialDeckSize: 10, finalFloor: 55, finalAct: 3, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters },
    { runId: 'silent-loss', character: 'silent', result: 'loss', initialDeckSize: 10, finalFloor: 20, finalAct: 1, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters },
    { runId: 'iron-loss', character: 'ironclad', result: 'loss', initialDeckSize: 10, finalFloor: 20, finalAct: 1, finalState: { deckSize: 10, gold: 0 }, counters: baseCounters }
  ]
});
assert.equal(aggregate.mainCharacter, 'silent', 'Usage ties must prefer the most recently used character.');
assert.equal(aggregate.stats.find(stat => stat.id === 'winRate').denominator, 1, 'Abandoned runs must not enter the win-rate denominator.');
assert.equal(aggregate.axes.every(axis => axis.value >= 0 && axis.value <= 100), true);
assert.equal(aggregate.axes.find(axis => axis.id === 'attackPlay').value, 100);
assert.equal(aggregate.axes.find(axis => axis.id === 'eliteChallenge').value, 100);

fs.rmSync(directory, { recursive: true, force: true });
console.log('Review service tests passed.');
