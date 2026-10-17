'use strict';

const { textKey } = require('./director');
const { personalityFor } = require('./language-profile');

const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanPhrase(value) {
  if (typeof value !== 'string' || /https?:|www\./i.test(value)) return '';
  let text = String(value || '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:攻击|防御|重击|多段攻击|强化|特殊行动)[！!:：、,，\s]+/u, '');
  text = text.replace(/^[^。！？!?：:]{1,12}[：:]\s*/u, '');
  if (text.length < 4 || text.length > 48 || /https?:|www\.|广告|加群|私信|微信|辱骂/i.test(text)) return '';
  return text;
}

class DanmakuLlmAtmosphere {
  constructor({ llm = null, now = () => Date.now(), ttlMs = 90_000, minIntervalMs = 3500, onLog = () => {} } = {}) {
    this.llm = llm;
    this.now = now;
    this.ttlMs = ttlMs;
    this.minIntervalMs = minIntervalMs;
    this.onLog = onLog;
    this.cache = new Map();
    this.pending = new Set();
    this.recentTexts = new Map();
    this.lastStartedAt = -Infinity;
  }

  key(context) {
    return [context.character || 'generic', context.batchId || '', context.trigger, ...(context.facts || [])].join('|');
  }

  async generate(context = {}, { signal } = {}) {
    if (signal?.aborted) return { status: 'cancelled', phrases: [] };
    if (!this.llm?.enabled || typeof this.llm.completeDanmaku !== 'function') return { status: 'unavailable', phrases: [] };
    for (const [key, expiresAt] of this.cache) if (expiresAt <= this.now()) this.cache.delete(key);
    for (const [key, expiresAt] of this.recentTexts) if (expiresAt <= this.now()) this.recentTexts.delete(key);
    const key = this.key(context);
    // 缓存是已消费请求的抑制窗口，不把上一次的台词再播一遍。
    if (this.cache.has(key) || this.pending.has(key)) return { status: 'duplicate', phrases: [] };
    if (this.now() - this.lastStartedAt < this.minIntervalMs) return { status: 'throttled', phrases: [] };
    this.lastStartedAt = this.now();
    this.pending.add(key);
    const promise = (async () => {
      try {
        const profile = personalityFor(context.character);
        const result = await this.llm.completeDanmaku({
          character: profile.key,
          characterName: profile.name,
          trigger: context.trigger || 'periodic',
          tone: profile.tone,
          style: profile.style,
          attention: profile.attention,
          reactions: profile.reactions,
          memoryVoice: profile.memoryVoice,
          moments: context.moments || [],
          runMemories: context.runMemories || [],
          mode: context.mode || 'observation',
          examples: profile.examples,
          count: 2,
          facts: (context.facts || []).slice(0, 24),
          snapshot: context.snapshot || null,
          recentEvents: (context.recentEvents || []).slice(-12),
          recentTexts: (context.recentTexts || []).slice(-20)
        }, { signal });
        if (signal?.aborted) return { status: 'cancelled', phrases: [] };
        const phrases = Array.isArray(result?.phrases) ? result.phrases : [];
        const enemies = context.snapshot?.enemies || [];
        const allowedKeys = new Set(enemies.map(enemy => enemy.key));
        const moments = new Set((context.moments || []).map(item => item.id));
        const valid = phrases.map(value => {
          const structured = value && typeof value === 'object';
          const text = cleanPhrase(structured ? value.text : value);
          if (!text) return null;
          const momentId = structured ? value.momentId || null : context.moments?.[0]?.id || null;
          if (momentId && !moments.has(momentId)) return null;
          const named = enemies.filter(enemy => text.includes(enemy.name)).map(enemy => enemy.key);
          const enemyKeys = structured && Array.isArray(value.enemyKeys) ? value.enemyKeys : named.length ? named : momentId ? [] : [...allowedKeys];
          if (enemyKeys.some(key => !allowedKeys.has(key))) return null;
          return { text, momentId, enemyKeys: [...new Set([...enemyKeys, ...named])] };
        }).filter(Boolean);
        const excluded = new Set((context.recentTexts || []).map(textKey));
        const selected = valid.filter(item => {
          const key = textKey(item.text);
          if (excluded.has(key) || this.recentTexts.has(key)) return false;
          excluded.add(key); return true;
        }).slice(0, 2);
        const items = selected.map(item => item.text);
        this.cache.set(key, this.now() + this.ttlMs);
        for (const text of items) this.recentTexts.set(textKey(text), this.now() + this.ttlMs);
        while (this.cache.size > 512) this.cache.delete(this.cache.keys().next().value);
        while (this.recentTexts.size > 512) this.recentTexts.delete(this.recentTexts.keys().next().value);
        this.onLog({ event: 'success', trigger: context.trigger, count: items.length });
        return { status: items.length ? 'generated' : valid.length || Array.isArray(result?.phrases) && !phrases.length ? 'duplicate' : 'failed', phrases: items, commentaryByText: Object.fromEntries(selected.map(({ text, ...meta }) => [text, meta])) };
      } catch (error) {
        if (signal?.aborted) return { status: 'cancelled', phrases: [] };
        this.onLog({ event: 'fallback', trigger: context.trigger, reason: error.message });
        return { status: 'failed', phrases: [] };
      } finally {
        this.pending.delete(key);
      }
    })();
    return promise;
  }
}

module.exports = { DanmakuLlmAtmosphere, cleanPhrase };
