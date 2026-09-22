'use strict';

const { CATALOG } = require('./catalog');

const safeText = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 60);
const sameContext = (left, right) => Boolean(left && right
  && left.runId === right.runId
  && left.sceneId === right.sceneId
  && left.stateRevision === right.stateRevision);

class DanmakuDirector {
  constructor({ now = () => Date.now(), random = Math.random, burstSize = 8, gapMs = 450 } = {}) {
    this.now = now;
    this.random = random;
    this.burstSize = Math.max(6, Math.min(8, Number(burstSize) || 8));
    this.gapMs = Math.max(350, Math.min(600, Number(gapMs) || 450));
    this.generation = 0;
    this.counter = 0;
    this.queue = [];
    this.active = [];
    this.events = new Set();
    this.triggers = new Set();
    this.recent = [];
    this.recentFamilies = [];
    this.context = null;
    this.closed = false;
    this.lastBurstAt = -Infinity;
    this.lastEmitAt = -Infinity;
  }

  invalidate() {
    this.generation += 1;
    this.queue = [];
    this.active = [];
  }

  setContext(context) {
    if (!context || !context.runId || !context.sceneId || !Number.isInteger(context.stateRevision)) {
      throw new TypeError('缺少有效的 runId / sceneId / stateRevision');
    }
    if (this.context?.runId === context.runId && this.context?.sceneId === context.sceneId
      && context.stateRevision < this.context.stateRevision) return false;
    if (sameContext(this.context, context)) return !this.closed;
    const changedScene = this.context?.runId !== context.runId || this.context?.sceneId !== context.sceneId;
    this.invalidate();
    if (changedScene) {
      this.events.clear();
      this.triggers.clear();
      this.closed = false;
      this.lastBurstAt = -Infinity;
    }
    this.context = { ...context };
    return !this.closed;
  }

  burst(event) {
    if (!sameContext(this.context, event) || this.closed || !event.eventId || this.events.has(event.eventId)) {
      return { accepted: false, reason: 'stale_or_duplicate' };
    }
    this.events.add(event.eventId);
    if (this.events.size > 1024) this.events.delete(this.events.values().next().value);
    const key = `${event.trigger}:${event.key || event.turn || 'scene'}`;
    if (this.triggers.has(key)) return { accepted: false, reason: 'trigger_already_used' };
    const priority = Number(event.priority) || 1;
    if (this.now() - this.lastBurstAt < 3000 && priority < 3) return { accepted: false, reason: 'cooldown' };
    const bank = event.factOnly ? [] : CATALOG[event.trigger];
    if (!bank) return { accepted: false, reason: 'unknown_trigger' };
    this.triggers.add(key);
    if (this.triggers.size > 512) this.triggers.delete(this.triggers.values().next().value);
    if (priority >= 3) this.invalidate();

    const factTexts = [...new Set((event.factTexts || [event.factText])
      .map(safeText)
      .filter(Boolean))];
    // factOnly 事件只允许 Mod 提供的明确事实；不能混入检索或原创氛围句。
    const corpus = event.factOnly ? [] : Array.isArray(event.corpusCandidates) ? event.corpusCandidates : [];
    const local = event.factOnly ? [] : Array.isArray(event.localCandidates) ? event.localCandidates : [];
    const llm = event.factOnly ? [] : Array.isArray(event.llmCandidates) ? event.llmCandidates : [];
    const knowledge = event.factOnly && !event.allowCodexFacts
      ? []
      : Array.isArray(event.knowledgeCandidates) ? event.knowledgeCandidates : [];
    const sourceByText = new Map([...corpus, ...knowledge, ...local, ...llm].map(item => [item.text, item]));
    const corpusTexts = [...new Set(corpus.map(item => safeText(item.text))
      .filter(text => text && !factTexts.includes(text)))];
    const localTexts = [...new Set(local.map(item => safeText(item.text))
      .filter(text => text && !factTexts.includes(text) && !corpusTexts.includes(text)))];
    const knowledgeTexts = [...new Set(knowledge.map(item => safeText(item.text))
      .filter(text => text && !factTexts.includes(text) && !corpusTexts.includes(text) && !localTexts.includes(text)))];
    const llmTexts = [...new Set(llm.map(item => safeText(item.text))
      .filter(text => text && !factTexts.includes(text) && !corpusTexts.includes(text) && !localTexts.includes(text)))];
    const isFresh = text => {
      const item = sourceByText.get(text);
      return !this.recent.includes(text) && (!item?.memeFamily || !this.recentFamilies.includes(item.memeFamily));
    };
    corpusTexts.sort((left, right) => Number(this.recent.includes(left)) - Number(this.recent.includes(right)));
    localTexts.sort((left, right) => Number(isFresh(right)) - Number(isFresh(left)));
    llmTexts.sort((left, right) => Number(isFresh(right)) - Number(isFresh(left)));
    const choices = [...new Set(bank)]
      .filter(text => !factTexts.includes(text) && !corpusTexts.includes(text));
    for (let index = choices.length - 1; index > 0; index -= 1) {
      const picked = Math.floor(this.random() * (index + 1));
      [choices[index], choices[picked]] = [choices[picked], choices[index]];
    }
    choices.sort((left, right) => Number(this.recent.includes(left)) - Number(this.recent.includes(right)));
    // 事实台词优先；入场关键词波次不追加任何氛围文案。
    const reserveLlmSlots = Math.max(0, Math.min(3, Number(event.reserveLlmSlots) || 0));
    const desiredSize = event.factOnly
      ? factTexts.length + (event.allowCodexFacts ? knowledgeTexts.filter(isFresh).slice(0, 3).length : 0)
      : Math.max(6, Math.min(this.burstSize, this.burstSize - reserveLlmSlots), factTexts.length);
    const texts = [
      ...factTexts,
      ...knowledgeTexts.filter(isFresh).slice(0, event.factOnly && event.allowCodexFacts ? 3 : 1),
      ...localTexts.filter(isFresh).slice(0, 1),
      ...corpusTexts.filter(isFresh).slice(0, 2),
      ...llmTexts.filter(isFresh).slice(0, 3),
      ...choices.filter(isFresh)
    ].slice(0, desiredSize);
    const start = Math.max(this.now(), (this.queue.at(-1)?.dueAt ?? this.now() - this.gapMs) + this.gapMs);
    const batchId = `wave-${++this.counter}`;
    texts.forEach((text, index) => this.queue.push({
      schema: 'gamebuddy.danmaku.v1', id: `${batchId}-${index}`, batchId,
      ...this.context, generation: this.generation, trigger: event.trigger, text,
      sourceEventIds: [event.eventId], recommendationId: event.recommendationId || null,
      recommendation: event.recommendation || null,
      wordingSource: sourceByText.get(text) || (factTexts.includes(text)
        ? { type: 'mod_fact', source: 'mod' }
        : { type: 'original_template', source: 'original' }),
      source: sourceByText.get(text)?.source || (factTexts.includes(text) ? 'mod' : 'original'),
      priority, style: ['low_hp', 'hp_drop', 'attack'].includes(event.trigger) ? 'tense' : 'warm',
      dueAt: start + index * this.gapMs,
      expiresAt: start + index * this.gapMs + 6000
    }));
    this.queue = this.queue.slice(0, 15);
    this.lastBurstAt = this.now();
    return { accepted: true, batchId, count: texts.length };
  }

  close(event) {
    if (!sameContext(this.context, event) || this.closed) return { accepted: false, reason: 'stale_or_closed' };
    this.invalidate();
    const result = this.burst({
      ...event,
      trigger: event.outcome === 'victory' ? 'victory' : event.outcome === 'defeat' ? 'defeat' : 'ended',
      priority: 3,
      key: 'end'
    });
    this.closed = true;
    return result;
  }

  appendAtmosphere({ context, trigger, items = [], limit = 3 } = {}) {
    if (!sameContext(this.context, context) || this.closed) return { accepted: false, reason: 'stale_context' };
    const queuedTexts = new Set(this.queue.map(item => item?.text).filter(Boolean));
    const candidates = items
      .map(item => ({ ...item, text: safeText(item?.text) }))
      .filter(item => item.text && !queuedTexts.has(item.text) && !this.recent.includes(item.text))
      .slice(0, Math.max(0, Math.min(3, Number(limit) || 0)));
    if (!candidates.length) return { accepted: false, reason: 'no_fresh_items' };
    const start = Math.max(this.now(), (this.queue.at(-1)?.dueAt ?? this.now() - this.gapMs) + this.gapMs);
    const batchId = `llm-${++this.counter}`;
    candidates.forEach((item, index) => this.queue.push({
      schema: 'gamebuddy.danmaku.v1',
      id: `${batchId}-${index}`,
      batchId,
      ...this.context,
      generation: this.generation,
      trigger,
      text: item.text,
      sourceEventIds: [],
      recommendationId: null,
      recommendation: null,
      wordingSource: item,
      source: item.source || 'llm_atmosphere',
      priority: 1,
      style: ['low_hp', 'hp_drop', 'attack'].includes(trigger) ? 'tense' : 'warm',
      dueAt: start + index * this.gapMs,
      expiresAt: start + index * this.gapMs + 6000
    }));
    this.queue = this.queue.slice(0, 24);
    return { accepted: true, batchId, count: candidates.length };
  }

  tick() {
    const now = this.now();
    this.active = this.active.filter(item => item.until > now);
    this.queue = this.queue.filter(item => item && item.expiresAt > now && item.generation === this.generation);
    if (now - this.lastEmitAt < this.gapMs || this.active.length >= 5 || this.queue[0]?.dueAt > now) return [];
    const message = this.queue.shift();
    // 防御性处理：队列可能刚被场景失效清空，或包含被旧版本写入的空项。
    // 主进程定时器必须宁可跳过一帧，也不能因为弹幕文案让 Electron 崩溃。
    if (!message || !safeText(message.text)) return [];
    const lane = [0, 1, 2, 3, 4].find(value => !this.active.some(item => item.lane === value));
    this.active.push({ lane, until: now + 4200 });
    this.lastEmitAt = now;
    this.recent = [...this.recent, message.text].slice(-20);
    const family = message.wordingSource?.memeFamily;
    if (family) this.recentFamilies = [...this.recentFamilies, family].slice(-20);
    return [{ ...message, lane, durationMs: 4200 }];
  }

  snapshot() {
    return { generation: this.generation, context: this.context, queued: this.queue.length, active: this.active.length };
  }
}

module.exports = { DanmakuDirector, sameContext };
