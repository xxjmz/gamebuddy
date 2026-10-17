const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLocalFactStore } = require('../facts/local-fact-store');
const reloadFacts = require('../harness/fixtures/fact-ten-reloads');
const { createFactReviewService, summarize } = require('./fact-service');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-fact-review-'));
const store = createLocalFactStore({ rootDir: path.join(directory, 'facts') });
for (const fact of reloadFacts) assert.equal(store.ingest(fact).durable, true);
const effective = store.getEffectiveFacts('run-reloads');
const coverage = store.getCoverage('run-reloads');
const reloadSummary = summarize('run-reloads', effective, coverage);
assert.equal(reloadSummary.result, 'loss');
assert.equal(reloadSummary.counters.typedCardsPlayed, 1, 'Superseded card plays entered the summary.');
assert.equal(reloadSummary.counters.attacksPlayed, 1, 'Only the latest combat attempt should count.');

const architectFacts = [
  {
    eventType: 'run.observed',
    occurredAt: 1,
    payload: { character: 'ironclad', act: 3, floor: 55, deck: [], relics: [], potions: [] }
  },
  {
    eventType: 'combat.started',
    eventId: 'boss-start',
    combatId: 'architect-boss',
    attemptGeneration: 0,
    occurredAt: 2,
    payload: { roomType: 'Boss', bossId: 'THE_ARCHITECT', bossName: '建筑师' }
  },
  {
    eventType: 'combat.ended',
    eventId: 'boss-end',
    combatId: 'architect-boss',
    attemptGeneration: 0,
    occurredAt: 3,
    payload: { victory: true }
  },
  { eventType: 'run.ended', occurredAt: 4, payload: { cleared: true, reason: 'game_ended_victory' } }
];
const architect = summarize('architect-run', architectFacts, {
  families: { card_play: { state: 'unavailable' }, combat_resolution: { state: 'unavailable' } }
});
assert.equal(architect.result, 'win');
assert.equal(architect.finalBossName, '建筑师');
assert.equal(architect.maxTurnDamage, null);
assert.equal(summarize('active-run', architectFacts.slice(0, -1), {}), null);

const service = createFactReviewService({ filePath: path.join(directory, 'review-history.v2.json') });
service.ingestRun('architect-run', architectFacts, { families: {} });
assert.equal(service.getDashboard().recentRuns[0].result, 'win');
assert.equal(service.getDashboard().window.abandoned, 0);
assert.equal(service.getHistory().runs.length, 1);

fs.rmSync(directory, { recursive: true, force: true });
console.log('Fact review service tests passed.');
