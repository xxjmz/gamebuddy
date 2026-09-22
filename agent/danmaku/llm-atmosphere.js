'use strict';

const CONTROL = /[\u0000-\u001f\u007f]/g;
const UNSAFE = /出牌|打出|卡牌|格挡|伤害|胜率|稳赢|必胜|建议|应该|必须|攻击.*\d|链接|https?:|www\.|广告|加群|私信|微信|vx/i;

function cleanPhrase(value) {
  const text = String(value || '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 4 || text.length > 24 || UNSAFE.test(text)) return '';
  return text;
}

class DanmakuLlmAtmosphere {
  constructor({ llm = null, now = () => Date.now(), ttlMs = 60_000, onLog = entry => console.info('[GameBuddy Danmaku LLM]', JSON.stringify(entry)) } = {}) {
    this.llm = llm;
    this.now = now;
    this.ttlMs = ttlMs;
    this.onLog = onLog;
    this.cache = new Map();
  }

  key(context) {
    return [context.characterKey || 'generic', context.trigger, context.tone, ...(context.sceneTags || []).sort()].join('|');
  }

  async generate(context) {
    if (!this.llm?.enabled || typeof this.llm.completeDanmaku !== 'function' || context?.trigger === 'entry') return [];
    const key = this.key(context);
    const cached = this.cache.get(key);
    if (cached?.expiresAt > this.now()) return cached.items;
    try {
      const result = await this.llm.completeDanmaku({
        character: context.characterKey || 'generic',
        sceneTags: context.sceneTags || [],
        tone: context.tone || 'warm',
        facts: (context.keywords || []).slice(0, 6)
      });
      const seen = new Set();
      const items = (result?.phrases || [])
        .map(cleanPhrase)
        .filter(text => text && !seen.has(text) && seen.add(text))
        .slice(0, 3)
        .map(text => ({
          text,
          source: 'llm_atmosphere',
          memeFamily: 'llm',
          tone: context.tone || 'warm'
        }));
      this.cache.set(key, { expiresAt: this.now() + this.ttlMs, items });
      this.onLog({ event: 'success', trigger: context.trigger, count: items.length });
      return items;
    } catch (error) {
      this.onLog({ event: 'fallback', trigger: context.trigger, reason: error.message });
      return [];
    }
  }
}

module.exports = { DanmakuLlmAtmosphere, cleanPhrase };
