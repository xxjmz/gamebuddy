'use strict';

const { ChromaDanmakuStore, createOllamaEmbedder, withTimeout } = require('./vector-store');

const TRIGGER_TERMS = {
  entry: '战斗开场 围观 陪伴',
  low_hp: '生命危险 紧张 鼓励 陪伴', hp_drop: '血量下降 紧张 反应', attack: '敌人攻击意图 紧张 注意',
  plan: '战斗辅助建议 已收到 参考', tentative: '暂定建议 不确定 参考',
  victory: '战斗胜利 庆祝', defeat: '战斗结束 陪伴', ended: '战斗结束 休息',
  mechanic: '战斗事件变化 围观', card_played: '已经出牌 战斗进行', general: '游戏观战 氛围 陪伴'
};

function queryFor(context) {
  const monster = (context.enemyNames || []).filter(Boolean).slice(0, 2).join('、');
  const facts = [
    TRIGGER_TERMS[context.trigger] || '游戏观战弹幕',
    context.scene === 'combat' ? '战斗场景' : '',
    monster ? `敌人 ${monster}` : '',
    ...(context.keywords || []).slice(0, 6)
  ];
  if (context.hpRatio !== undefined && context.hpRatio <= 0.25) facts.push('低血量');
  if (context.certainty && context.certainty !== 'high') facts.push('暂定');
  return facts.filter(Boolean).join('；');
}

function similarityFromDistance(distance) {
  return Number.isFinite(distance) ? 1 / (1 + Math.max(0, distance)) : 0;
}

function corpusTone(tone) {
  if (tone === 'hype') return 'excited';
  if (tone === 'tense') return 'tense';
  return 'warm';
}

class DanmakuRetriever {
  constructor({
    store = new ChromaDanmakuStore(),
    embedder = createOllamaEmbedder(),
    timeoutMs = 350,
    minScore = 0.32,
    now = () => Date.now(),
    onLog = entry => console.info('[GameBuddy Danmaku Retrieval]', JSON.stringify(entry))
  } = {}) {
    this.store = store;
    this.embedder = embedder;
    this.timeoutMs = timeoutMs;
    this.minScore = minScore;
    this.now = now;
    this.onLog = onLog;
    this.cache = new Map();
  }

  cacheKey(context) {
    return [context.scene || 'combat', context.trigger, ...(context.enemyNames || []).slice(0, 2), context.certainty || ''].join('|');
  }

  async retrieve(context, { limit = 2 } = {}) {
    if (!context?.trigger || !TRIGGER_TERMS[context.trigger]) return [];
    const key = this.cacheKey(context);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.onLog({ event: 'cache_hit', trigger: context.trigger, retrievedCount: cached.items.length });
      return cached.items.slice(0, limit);
    }
    try {
      const items = await withTimeout((async () => {
        let embedding;
        try {
          [embedding] = await this.embedder.embed(queryFor(context));
          this.onLog({ event: 'ollama_embedding', outcome: 'success', trigger: context.trigger });
        } catch (error) {
          this.onLog({ event: 'ollama_embedding', outcome: 'failure', trigger: context.trigger, reason: error.message });
          throw error;
        }
        let rows;
        try {
          rows = await this.store.query(embedding, {
            scene: context.scene || 'combat',
            trigger: context.trigger,
            tone: corpusTone(context.tone),
            limit: Math.max(limit * 3, 6)
          });
          if (!rows.length && context.trigger !== 'general') {
            rows = await this.store.query(embedding, {
              scene: context.scene || 'combat',
              trigger: 'general',
              tone: corpusTone(context.tone),
              limit: Math.max(limit * 3, 6)
            });
          }
          this.onLog({ event: 'chroma_query', outcome: 'success', trigger: context.trigger, retrievedCount: rows.length });
        } catch (error) {
          this.onLog({ event: 'chroma_query', outcome: 'failure', trigger: context.trigger, reason: error.message });
          throw error;
        }
        const seen = new Set();
        const selected = rows
          .map(row => ({
            text: String(row.text || '').trim(),
            score: similarityFromDistance(row.distance),
            triggers: [row.metadata?.trigger || context.trigger],
            bvid: row.metadata?.bvid || null,
            atSeconds: row.metadata?.atSeconds ?? null,
            source: 'bilibili'
          }))
          .filter(item => item.text && item.score >= this.minScore && !seen.has(item.text) && seen.add(item.text))
          .slice(0, limit);
        this.onLog({ event: 'retrieval', outcome: 'success', trigger: context.trigger, retrievedCount: selected.length });
        return selected;
      })(), this.timeoutMs, 'Danmaku retrieval');
      this.cache.set(key, { expiresAt: this.now() + 60_000, items });
      return items;
    } catch (error) {
      this.onLog({ event: 'fallback', trigger: context.trigger, reason: error.message || 'retrieval_failed' });
      return [];
    }
  }
}

module.exports = { DanmakuRetriever, TRIGGER_TERMS, queryFor, similarityFromDistance, corpusTone };
