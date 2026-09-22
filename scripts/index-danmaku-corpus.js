'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { ChromaDanmakuStore, createOllamaEmbedder } = require('../agent/danmaku/vector-store');

function args(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    output[argv[index].slice(2)] = argv[index + 1] || true;
    index += 1;
  }
  return output;
}

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function recordsFor(rows) {
  const records = [];
  for (const row of rows) {
    if (row?.safe !== true || typeof row.text !== 'string' || !Array.isArray(row.triggers)) continue;
    const triggers = [...new Set(row.triggers.filter(trigger => typeof trigger === 'string' && trigger))];
    for (const trigger of triggers) {
      records.push({
        id: `${row.id}:${trigger}`,
        document: row.text.trim(),
        metadata: {
          safe: true,
          scene: String(row.scene || 'combat'),
          trigger,
          tone: String(row.tone || 'warm'),
          memeCategory: String(row.memeCategory || 'general'),
          bvid: String(row.bvid || ''),
          atSeconds: Number.isFinite(row.atSeconds) ? row.atSeconds : -1,
          source: 'bilibili',
          sourceId: String(row.id || '')
        }
      });
    }
  }
  return records;
}

async function main() {
  const options = args(process.argv.slice(2));
  const input = options.input || path.join('.runtime', 'danmaku-corpus.jsonl');
  const batchSize = Math.max(1, Math.min(128, Number(options.batch || 32)));
  const rows = readJsonl(input);
  const records = recordsFor(rows);
  const store = new ChromaDanmakuStore({ timeoutMs: Number(options.timeout || 10_000) });
  const embedder = createOllamaEmbedder({ timeoutMs: Number(options.timeout || 10_000) });
  if (options['dry-run']) {
    console.log(JSON.stringify({
      input,
      prepared: rows.length,
      records: records.length,
      collection: store.collection,
      dryRun: true
    }, null, 2));
    return;
  }
  if (!options.append) {
    await store.reset();
    console.log(`reset collection ${store.collection}`);
  }
  let indexed = 0;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const embeddings = await embedder.embed(batch.map(record => record.document));
    await store.upsert(batch.map((record, index) => ({ ...record, embedding: embeddings[index] })));
    indexed += batch.length;
    console.log(`indexed ${indexed}/${records.length}`);
  }
  const collectionCount = await store.count();
  if (!options.append && collectionCount !== records.length) {
    throw new Error(`Chroma count mismatch: expected ${records.length}, received ${collectionCount}`);
  }
  console.log(JSON.stringify({
    input,
    prepared: rows.length,
    collection: store.collection,
    indexed,
    collectionCount,
    embeddingModel: embedder.model
  }, null, 2));
}

module.exports = { readJsonl, recordsFor };

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
