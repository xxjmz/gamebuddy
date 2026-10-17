const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const readyBlock = mainSource.slice(
  mainSource.indexOf('app.whenReady().then'),
  mainSource.indexOf("app.on('before-quit'")
);

assert.doesNotMatch(readyBlock, /\bcreateMainWindow\s*\(/, 'Startup must not create the legacy workbench.');
assert.match(readyBlock, /\bcreatePetWindow\s*\(/, 'Startup must keep creating the desktop pet.');
assert.match(mainSource, /label: '个人数据'/, 'Pet and tray menus must expose Personal Data.');
assert.match(mainSource, /loadFile\(path\.join\(__dirname, 'src', 'review\.html'\)\)/, 'Personal Data must use its lightweight page.');
assert.match(mainSource, /if \(reviewWindow && !reviewWindow\.isDestroyed\(\)\)/, 'Repeated opens must reuse the existing window.');
assert.match(mainSource, /if \(window === reviewWindow\) window\.destroy\(\)/, 'Closing Personal Data must destroy its renderer.');

const reviewHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'review.html'), 'utf8');
assert.match(reviewHtml, /review-renderer\.js/);
assert.doesNotMatch(reviewHtml, /src="\.\/renderer\.js"/);
assert.doesNotMatch(reviewHtml, /llm-log/);
assert.doesNotMatch(reviewHtml, /primary-nav/);

console.log('Personal data window lifecycle tests passed.');
