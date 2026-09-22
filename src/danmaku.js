'use strict';

const layer = document.querySelector('#danmaku-layer');
let generation = '';

function clearDanmaku() {
  generation = '';
  layer?.replaceChildren();
}

function showDanmaku(message) {
  if (!layer || !message?.text) return;
  const nextGeneration = `${message.runId}:${message.sceneId}:${message.generation}`;
  if (generation && generation !== nextGeneration) clearDanmaku();
  generation = nextGeneration;
  const item = document.createElement('span');
  item.className = `danmaku-item ${message.style === 'tense' ? 'tense' : ''}`;
  item.style.setProperty('--danmaku-lane', String(Math.max(0, Math.min(4, Number(message.lane) || 0))));
  item.textContent = String(message.text).slice(0, 80);
  if (message.detail?.title || message.detail?.lines?.length) {
    const detail = document.createElement('span');
    detail.className = 'danmaku-detail';
    const title = document.createElement('strong');
    title.textContent = String(message.detail.title || message.text).slice(0, 100);
    detail.append(title);
    for (const line of message.detail.lines || []) {
      const row = document.createElement('span');
      row.textContent = String(line).slice(0, 180);
      detail.append(row);
    }
    item.append(detail);
  }
  layer.append(item);
  const duration = Math.max(1200, Number(message.durationMs) || 4200);
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let motion;
  if (reduced) {
    motion = item.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration, easing: 'linear' });
  } else {
    const distance = Math.ceil(item.getBoundingClientRect().width) + layer.clientWidth + 32;
    motion = item.animate([
      { transform: 'translateX(8px)', opacity: 1 },
      { transform: `translateX(-${distance}px)`, opacity: 1 }
    ], { duration, easing: 'linear' });
  }
  let remaining = duration + 120;
  let deadline = performance.now() + remaining;
  let removalTimer;
  const remove = () => {
    window.clearTimeout(removalTimer);
    item.remove();
  };
  const scheduleRemoval = () => {
    deadline = performance.now() + remaining;
    removalTimer = window.setTimeout(remove, remaining);
  };
  const pause = () => {
    if (item.classList.contains('paused')) return;
    remaining = Math.max(0, deadline - performance.now());
    window.clearTimeout(removalTimer);
    motion?.pause();
    item.classList.add('paused');
  };
  const resume = () => {
    if (!item.classList.contains('paused')) return;
    item.classList.remove('paused');
    motion?.play();
    scheduleRemoval();
  };
  item.addEventListener('pointerenter', pause);
  item.addEventListener('pointerleave', resume);
  scheduleRemoval();
}

window.gamebuddyBridge?.onDanmaku(showDanmaku);
window.gamebuddyBridge?.onDanmakuClear(clearDanmaku);
