'use strict';

const { BrowserWindow } = require('electron');

function createComposerHost({ bounds, preload, page, parent }) {
  const host = new BrowserWindow({
    ...bounds,
    title: 'GameBuddy · 发弹幕',
    parent,
    frame: false,
    transparent: false,
    backgroundColor: '#121717',
    focusable: true,
    acceptFirstMouse: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: true,
    autoHideMenuBar: true,
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  host.setIgnoreMouseEvents(false);
  host.setAlwaysOnTop(true, 'screen-saver');
  host.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  host.loadFile(page, { query: { surface: 'composer' } });
  return host;
}

function showComposerHost(host, { activate = false } = {}) {
  if (!host || host.isDestroyed()) return;
  if (!host.isFocusable()) host.setFocusable(true);
  host.setIgnoreMouseEvents(false);
  if (activate) {
    host.show();
    host.focus();
    host.webContents.focus();
  } else if (!host.isVisible()) host.showInactive();
  host.moveTop();
}

function setComposerExpanded(host, expanded, bounds) {
  if (!host || host.isDestroyed()) return;
  host.setBounds(bounds);
  if (expanded) showComposerHost(host, { activate: true });
  else host.blur(); // 收起只交还焦点，不能把下一次点击所需的激活能力关掉。
}

module.exports = { createComposerHost, showComposerHost, setComposerExpanded };
