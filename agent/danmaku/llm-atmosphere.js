'use strict';

const CONTROL = /[\u0000-\u001f\u007f]/g;

function cleanPhrase(value) {
  let text = String(value || '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  text = text.replace(/^(?:攻击|防御|重击|多段攻击|强化|特殊行动)[！!:：、,，\s]+/u, '');
  text = text.replace(/^[^。！？!?：:]{1,12}[：:]s*/u, '');
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
    this.pending = new Map();
    this.lastStartedAt = -Infinity;
  }

  key(context) {
    return [context.character || 'ironclad', context.trigger, ...(context.facts || [])].join('|');
  }

  async generate(context = {}) {
    if (!this.llm?.enabled || typeof this.llm.completeDanmaku !== 'function') return [];
    const key = this.key(context);
    const cached = this.cache.get(key);
    if (cached?.expiresAt > this.now()) return cached.items;
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.now() - this.lastStartedAt < this.minIntervalMs) return [];
    this.lastStartedAt = this.now();
    const promise = (async () => {
      try {
        const result = await this.llm.completeDanmaku({
          character: context.character || 'ironclad',
          trigger: context.trigger || 'enemy_move',
          tone: 'battle_hardened',
          style: '铁甲战士：铁血、直接、克制，有老兵的冷幽默；像在战场上随口说的一句话。',
          facts: (context.facts || []).slice(0, 5),
          examples: [
            '这一拳没有私人恩怨。',
            '挨过这一下，才算热身。',
            '站稳了，接下来才是真格。'
          ]
        });
        const phrases = Array.isArray(result?.phrases) ? result.phrases : [];
        const seen = new Set();
        const items = phrases.map(cleanPhrase).filter(text => text && !seen.has(text) && seen.add(text)).slice(0, 2);
        this.cache.set(key, { expiresAt: this.now() + this.ttlMs, items });
        this.onLog({ event: 'success', trigger: context.trigger, count: items.length });
        return items;
      } catch (error) {
        this.onLog({ event: 'fallback', trigger: context.trigger, reason: error.message });
        return [];
      } finally {
        this.pending.delete(key);
      }
    })();
    this.pending.set(key, promise);
    return promise;
  }
}

module.exports = { DanmakuLlmAtmosphere, cleanPhrase };
