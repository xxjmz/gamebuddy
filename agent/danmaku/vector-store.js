'use strict';

function withTimeout(promise, timeoutMs, label = 'request') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function parseResponse(response, label) {
  if (response.ok) return response.status === 204 ? null : response.json();
  const text = await response.text().catch(() => '');
  const error = new Error(`${label} failed: HTTP ${response.status}${text ? ` ${text.slice(0, 300)}` : ''}`);
  error.status = response.status;
  throw error;
}

class ChromaDanmakuStore {
  constructor({
    baseUrl = process.env.GAMEBUDDY_DANMAKU_CHROMA_URL || 'http://127.0.0.1:8010',
    tenant = process.env.GAMEBUDDY_DANMAKU_CHROMA_TENANT || 'default_tenant',
    database = process.env.GAMEBUDDY_DANMAKU_CHROMA_DATABASE || 'default_database',
    collection = process.env.GAMEBUDDY_DANMAKU_COLLECTION || 'gamebuddy_danmaku_v1',
    fetchImpl = globalThis.fetch,
    timeoutMs = 300
  } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.tenant = tenant;
    this.database = database;
    this.collection = collection;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.collectionReady = null;
  }

  collectionPath() {
    return `${this.baseUrl}/api/v2/tenants/${encodeURIComponent(this.tenant)}/databases/${encodeURIComponent(this.database)}/collections/${encodeURIComponent(this.collection)}`;
  }

  async recordsPath(suffix) {
    const collection = await this.ensureCollection();
    if (!collection?.id) throw new Error('Chroma collection did not return an id');
    return `${this.collectionPath().replace(`/${encodeURIComponent(this.collection)}`, `/${encodeURIComponent(collection.id)}`)}${suffix}`;
  }

  async request(path, options = {}, label = 'Chroma') {
    if (typeof this.fetch !== 'function') throw new Error('fetch is unavailable');
    const response = await withTimeout(this.fetch(path, options), this.timeoutMs, label);
    return parseResponse(response, label);
  }

  async ensureCollection() {
    if (this.collectionReady) return this.collectionReady;
    this.collectionReady = (async () => {
      try {
        return await this.request(this.collectionPath(), {}, 'Chroma get collection');
      } catch (error) {
        if (error.status !== 404) throw error;
        return this.request(this.collectionPath().replace(`/${encodeURIComponent(this.collection)}`, ''), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: this.collection,
            get_or_create: true,
            metadata: { purpose: 'gamebuddy-reviewed-danmaku' }
          })
        }, 'Chroma create collection');
      }
    })().catch(error => {
      this.collectionReady = null;
      throw error;
    });
    return this.collectionReady;
  }

  async upsert(records) {
    if (!Array.isArray(records) || !records.length) return { inserted: 0 };
    await this.request(await this.recordsPath('/upsert'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ids: records.map(record => record.id),
        documents: records.map(record => record.document),
        embeddings: records.map(record => record.embedding),
        metadatas: records.map(record => record.metadata)
      })
    }, 'Chroma upsert');
    return { inserted: records.length };
  }

  async count() {
    const body = await this.request(await this.recordsPath('/count'), {}, 'Chroma count');
    const count = typeof body === 'number' ? body : Number(body?.count);
    if (!Number.isInteger(count) || count < 0) throw new Error('Chroma count returned an invalid value');
    return count;
  }

  async reset() {
    await this.ensureCollection();
    await this.request(this.collectionPath(), { method: 'DELETE' }, 'Chroma delete collection');
    this.collectionReady = null;
  }

  async query(embedding, { scene = 'combat', trigger, tone, limit = 6 } = {}) {
    const filters = [
      { safe: { '$eq': true } },
      { scene: { '$eq': scene } },
      { trigger: { '$eq': trigger } }
    ];
    if (tone) filters.push({ tone: { '$eq': tone } });
    const body = await this.request(await this.recordsPath('/query'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query_embeddings: [embedding],
        n_results: Math.max(1, Math.min(20, limit)),
        where: { '$and': filters },
        include: ['documents', 'metadatas', 'distances']
      })
    }, 'Chroma query');
    const ids = body.ids?.[0] || [];
    const documents = body.documents?.[0] || [];
    const metadatas = body.metadatas?.[0] || [];
    const distances = body.distances?.[0] || [];
    return ids.map((id, index) => ({
      id,
      text: documents[index] || '',
      metadata: metadatas[index] || {},
      distance: Number(distances[index])
    }));
  }
}

function createOllamaEmbedder({
  baseUrl = process.env.GAMEBUDDY_DANMAKU_OLLAMA_URL || 'http://127.0.0.1:11434',
  model = process.env.GAMEBUDDY_DANMAKU_EMBED_MODEL || 'nomic-embed-text',
  fetchImpl = globalThis.fetch,
  timeoutMs = 300
} = {}) {
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}/api/embed`;
  return {
    model,
    async embed(inputs) {
      const values = Array.isArray(inputs) ? inputs : [inputs];
      if (!values.length) return [];
      const response = await withTimeout(fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: values })
      }), timeoutMs, 'Ollama embedding');
      const body = await parseResponse(response, 'Ollama embedding');
      if (!Array.isArray(body.embeddings) || body.embeddings.length !== values.length) {
        throw new Error('Ollama embedding returned an invalid vector batch');
      }
      return body.embeddings;
    }
  };
}

module.exports = { ChromaDanmakuStore, createOllamaEmbedder, withTimeout };
