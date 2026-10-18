'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { writeGatewayPreference, readGatewayPreference } = require('../agent/llm/preferred-gateway');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gamebuddy-gateway-ui-')));
const file = path.join(app.getPath('userData'), 'llm-gateway.json');
let cancelled = false;
ipcMain.handle('gateway-setup:load', () => ({
  apiKey: '',
  baseURL: 'https://copilot.tencent.com/v2/',
  gatewayName: '公司个人 token 网关'
}));
ipcMain.handle('gateway-setup:save', (_event, payload) => {
  const saved = writeGatewayPreference(file, payload);
  return saved.ok ? { ok: true } : { ok: false, message: saved.message };
});
ipcMain.on('gateway-setup:cancel', () => { cancelled = true; });

const timer = setTimeout(() => {
  console.error('Gateway setup renderer timed out');
  app.exit(1);
}, 20000);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 440,
    height: 390,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await win.loadFile(path.join(__dirname, '..', 'src', 'gateway-setup.html'));
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const text = await win.webContents.executeJavaScript('document.body.innerText');
  assert.match(text, /API Key/);
  assert.match(text, /网关/);
  assert.match(text, /公司个人 token 网关/);
  assert.equal(await win.webContents.executeJavaScript('document.querySelector("#baseURL").value'), 'https://copilot.tencent.com/v2/');
  await win.webContents.executeJavaScript('document.querySelector("#form").requestSubmit()');
  await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  assert.match(await win.webContents.executeJavaScript('document.querySelector("#error").textContent'), /请填写 API Key/);
  assert.equal(fs.existsSync(file), false);
  await win.webContents.executeJavaScript(`
    document.querySelector('#apiKey').value = 'smoke-key';
    document.querySelector('#baseURL').value = 'https://copilot.tencent.com/v2/';
    document.querySelector('#form').requestSubmit();
  `);
  await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 50))');
  assert.deepEqual(readGatewayPreference(file), {
    apiKey: 'smoke-key',
    baseURL: 'https://copilot.tencent.com/v2'
  });
  await win.webContents.executeJavaScript('document.querySelector("#cancel").click()');
  assert.equal(cancelled, true);
  clearTimeout(timer);
  win.destroy();
  console.log('Gateway setup dialog passed');
  app.exit(0);
}).catch(error => {
  console.error(error);
  clearTimeout(timer);
  app.exit(1);
});
