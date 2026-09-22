'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalized, classify, memeCategory, safeRecord } = require('../../scripts/prepare-danmaku-corpus');
const { recordsFor } = require('../../scripts/index-danmaku-corpus');

test('corpus preparation cleans text and keeps general atmosphere records', () => {
  assert.equal(normalized('  好耶\u0000  '), '好耶');
  assert.deepEqual(classify('前排坐好'), ['entry']);
  assert.equal(memeCategory('前排坐好'), 'front-row');
  assert.deepEqual(classify('围观中'), ['general']);
  assert.deepEqual(safeRecord('这回合必须打防御'), { safe: false, reason: 'strategy' });
  assert.deepEqual(safeRecord('玩大卡组鬼抽一次掉二三十血'), { safe: false, reason: 'strategy' });
});

test('index expands trigger metadata while preserving one source identity', () => {
  const records = recordsFor([{
    id: 'bilibili-a',
    text: '好耶',
    safe: true,
    scene: 'combat',
    triggers: ['victory', 'general'],
    tone: 'excited',
    memeCategory: 'cheer',
    bvid: 'BV1test',
    atSeconds: 12.3
  }]);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(record => record.id), ['bilibili-a:victory', 'bilibili-a:general']);
  assert.equal(records[0].metadata.source, 'bilibili');
  assert.equal(records[0].metadata.sourceId, 'bilibili-a');
  assert.equal(records[0].metadata.scene, 'combat');
  assert.equal(records[0].metadata.memeCategory, 'cheer');
});
