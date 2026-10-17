'use strict';

// 弹幕 Director 只负责事件去重、排队和播放节奏。
// 文案必须由 Mod/Codex 事实或本地固定模板显式传入，不在这里检索语料或调用模型。
const safeText = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const sameScene = (left, right) => Boolean(left && right
  && left.runId === right.runId
  && left.sceneId === right.sceneId);
const sameContext = (left, right) => sameScene(left, right)
  && left.stateRevision === right.stateRevision;

class DanmakuDirector {
  constructor({ now = () => Date.now(), burstSize = 8, gapMs = 450 } = {}) {
    this.now = now;
    this.burstSize = Math.max(6, Math.min(12, Number(burstSize) || 8));
    this.gapMs = Math.max(350, Math.min(1200, Number(gapMs) || 450));
    this.laneCount = 3;
    this.laneReadyAt = Array.from({ length: this.laneCount }, () => -Infinity);
    this.generation = 0;
    this.counter = 0;
    this.queue = [];
    this.active = [];
    this.events = new Set();
    this.triggers = new Set();
    this.recent = [];
    this.context = null;
    this.closed = false;
    this.lastBurstAt = -Infinity;
    this.lastEmitAt = -Infinity;
    this.laneCursor = 0;
  }

  invalidate() {
    this.generation += 1;
    this.queue = [];
    this.active = [];
    this.laneReadyAt = Array.from({ length: this.laneCount }, () => -Infinity);
    this.laneCursor = 0;
  }

  setContext(context) {
    if (!context || !context.runId || !context.sceneId || !Number.isInteger(context.stateRevision)) {
      throw new TypeError('缺少有效的 runId / sceneId / stateRevision');
    }
    if (sameScene(this.context, context)) {
      if (context.stateRevision < this.context.stateRevision) return false;
      this.context = { ...context };
      return !this.closed;
    }
    this.invalidate();
    this.events.clear();
    this.triggers.clear();
    this.closed = false;
    this.lastBurstAt = -Infinity;
    this.context = { ...context };
    return true;
  }

  burst(event) {
    if (!sameScene(this.context, event) || this.closed || !event.eventId || this.events.has(event.eventId)) {
      return { accepted: false, reason: 'stale_or_duplicate' };
    }
    this.events.add(event.eventId);
    if (this.events.size > 1024) this.events.delete(this.events.values().next().value);
    const key = `${event.trigger}:${event.key || event.turn || 'scene'}`;
    if (this.triggers.has(key)) return { accepted: false, reason: 'trigger_already_used' };
    const priority = Number(event.priority) || 1;
    if (this.now() - this.lastBurstAt < 3000 && priority < 3) return { accepted: false, reason: 'cooldown' };
    this.triggers.add(key);
    if (this.triggers.size > 512) this.triggers.delete(this.triggers.values().next().value);

    const factTexts = [...new Set((event.factTexts || [event.factText])
      .map(safeText)
      .filter(Boolean))];
    if (!factTexts.length) return { accepted: false, reason: 'no_fixed_dialogue' };
    const detailByText = event.detailByText || {};
    const factSourceByText = event.factSourceByText || {};
    const start = Math.max(this.now(), (this.queue.at(-1)?.dueAt ?? this.now() - this.gapMs) + this.gapMs);
    const batchId = `wave-${++this.counter}`;
    factTexts.forEach((text, index) => {
      const detail = detailByText[text] || null;
      const wordingSource = factSourceByText[text] || { type: 'fixed_dialogue', source: 'original_template' };
      this.queue.push({
        schema: 'gamebuddy.danmaku.v1',
        id: `${batchId}-${index}`,
        batchId,
        ...this.context,
        generation: this.generation,
        trigger: event.trigger,
        text,
        sourceEventIds: [event.eventId],
        recommendationId: event.recommendationId || null,
        recommendation: event.recommendation || null,
        detail,
        wordingSource,
        source: wordingSource.source || 'original_template',
        priority,
        style: ['enemy_move', 'recommendation'].includes(event.trigger) ? 'tense' : 'warm',
        dueAt: start + index * this.gapMs,
        expiresAt: start + index * this.gapMs + 30_000
      });
    });
    // 不截断已经入队的弹幕；每条都必须完整走完屏幕。
    this.lastBurstAt = this.now();
    return { accepted: true, batchId, count: factTexts.length };
  }

  close(event) {
    if (!sameScene(this.context, event) || this.closed) return { accepted: false, reason: 'stale_or_closed' };
    this.closed = true;
    this.queue = [];
    return { accepted: true, count: 0, reason: 'closed' };
  }

  tick() {
    const now = this.now();
    this.active = this.active.filter(item => item.until > now);
    this.queue = this.queue.filter(item => item && item.expiresAt > now && item.generation === this.generation);
    if (now - this.lastEmitAt < this.gapMs || this.queue[0]?.dueAt > now) return [];
    const lane = this.freeLane(now);
    if (lane == null) return [];
    const message = this.queue.shift();
    if (!message || !safeText(message.text)) return [];
    this.laneReadyAt[lane] = now + 5600;
    this.active.push({ lane, until: now + 12_000 });
    this.lastEmitAt = now;
    this.recent = [...this.recent, message.text].slice(-20);
    return [{ ...message, lane, durationMs: 10_000 }];
  }

  freeLane(now) {
    for (let offset = 0; offset < this.laneCount; offset += 1) {
      const lane = (this.laneCursor + offset) % this.laneCount;
      if ((this.laneReadyAt[lane] || 0) <= now) {
        this.laneCursor = lane + 1;
        return lane;
      }
    }
    return null;
  }

  snapshot() {
    return { generation: this.generation, context: this.context, queued: this.queue.length, active: this.active.length };
  }
}

module.exports = { DanmakuDirector, sameContext, sameScene };
