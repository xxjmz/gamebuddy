'use strict';

// 用真实 Electron renderer 和 preload 验证消息幂等与上屏确认，不启动主应用或联网。
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DanmakuDirector } = require('../agent/danmaku/director');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-danmaku-smoke-'));
app.setPath('userData', userData);
let window;
let now = 0;
const director = new DanmakuDirector({ now: () => now });
const scope = { runId: 'smoke', sceneId: 'smoke-combat', stateRevision: 1 };
director.setContext(scope);
let confirmations = 0;
ipcMain.on('danmaku-presented', (event, id) => {
  if (event.sender !== window?.webContents) return;
  confirmations += 1;
  director.acknowledgePresented(id);
});
ipcMain.handle('get-danmaku-stats', () => director.presentationStats());
ipcMain.handle('get-shared-danmaku-context', () => null);
const timeout = setTimeout(() => { console.error('Danmaku renderer smoke timed out'); app.exit(1); }, 15_000);

async function waitForCount(count) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const actual = await window.webContents.executeJavaScript('document.querySelectorAll(".danmaku-item").length');
    if (actual === count && confirmations >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${count} rendered items`);
}

app.whenReady().then(async () => {
  window = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: {
    preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
  } });
  await window.loadFile(path.join(__dirname, '..', 'src', 'danmaku.html'));
  for (const [index, source] of ['ai', 'original_template', 'recommendation', 'shared', 'monster_skill'].entries()) {
    now = index * 6000;
    const text = `渲染确认测试 ${index}`;
    director.burst({ ...scope, eventId: `event-${index}`, trigger: 'smoke', key: `${index}`, priority: 3,
      factTexts: [text], factSourceByText: { [text]: { source } } });
    const [message] = director.tick();
    window.webContents.send('bridge-danmaku', { ...message, character: 'ironclad' });
    window.webContents.send('bridge-danmaku', { ...message, character: 'ironclad' });
    await waitForCount(index + 1);
  }
  assert.equal(confirmations, 5);
  const stats = await window.webContents.executeJavaScript('window.gamebuddyBridge.getDanmakuStats()');
  assert.equal(stats.total, 5);
  assert.equal(stats.aiPercent, 20);
  assert.equal(stats.commentaryAiPercent, 50);
  window.webContents.send('bridge-danmaku-clear', {});
  await waitForCount(0);
  assert.equal(director.presentationStats().total, 5);
  const preview = [
    ['ironclad', '铁甲战士', '伤口会记住，嘴就不必了。'],
    ['silent', '静默猎手', '动静很大。破绽也是。'],
    ['defect', '故障机器人', '我似乎不喜欢这里。这个发现很新。'],
    ['regent', '储君', '这里的迎宾礼，实在欠缺教养。'],
    ['necrobinder', '亡灵契约师', '别紧张，骨头通常很有耐心。']
  ];
  for (const [index, [character, speaker, text]] of preview.entries()) {
    window.webContents.send('bridge-danmaku', { id: `preview-${index}`, character, speaker, source: 'ai', text });
  }
  window.webContents.send('bridge-danmaku', { id: 'preview-skill', character: 'ironclad', source: 'monster_skill',
    skillLabel: '小啃兽（2） · 顶撞', text: '没什么，我只是要狠狠地给你来一下。',
    detail: { title: '小啃兽的当前行动', source: 'mod', lines: ['行动：顶撞', '效果：造成伤害', '来源：Mod 当前行动数据'] } });
  await waitForCount(6);
  const labels = await window.webContents.executeJavaScript(`({
    ai: [...document.querySelectorAll('[data-source="ai"] .danmaku-speaker')].map(e => e.textContent),
    skill: document.querySelector('.danmaku-skill .danmaku-speaker').textContent,
    skillAvatars: document.querySelectorAll('.danmaku-skill img').length,
    detail: document.querySelector('.danmaku-skill .danmaku-detail').textContent
  })`);
  assert.deepEqual(labels.ai, preview.map(item => item[1]));
  assert.match(labels.skill, /技能.*小啃兽（2）.*顶撞/);
  assert.equal(labels.skillAvatars, 0);
  assert.match(labels.detail, /Mod 当前行动数据/);
  // 仅在预览中暂停飞行并排成纵列，便于目视检查真实组件和悬停详情。
  await window.webContents.executeJavaScript(`
    document.body.style.background = '#0b141a';
    const style = document.createElement('style');
    style.textContent = '.danmaku-item { left: 40px !important; transform: none !important; }';
    document.head.append(style);
    [...document.querySelectorAll('.danmaku-item')].forEach((item, i) => {
      item.style.setProperty('left', '40px', 'important');
      item.style.setProperty('top', (40 + i * 100) + 'px', 'important');
      item.style.setProperty('transform', 'none', 'important');
    });
    document.querySelector('.danmaku-skill').classList.add('hovered');
  `);
  await new Promise(resolve => setTimeout(resolve, 200));
  const layout = await window.webContents.executeJavaScript(`(() => {
    const item = document.querySelector('.danmaku-skill');
    return { outer: item.getBoundingClientRect().bottom, text: item.querySelector('.gb-danmaku__text').getBoundingClientRect().bottom };
  })()`);
  assert.ok(layout.text <= layout.outer, 'skill text must fit inside its frame');
  const screenshotPath = path.join(os.tmpdir(), 'gamebuddy-danmaku-personas-preview.png');
  fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG());
  console.log(`Danmaku renderer smoke passed: ${JSON.stringify(stats)}; preview: ${screenshotPath}`);
  clearTimeout(timeout);
  window.destroy();
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timeout);
  window?.destroy();
  app.exit(1);
});

process.on('exit', () => { try { fs.rmSync(userData, { recursive: true, force: true }); } catch {} });
