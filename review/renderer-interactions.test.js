const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function decode(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function readAttr(source, name) {
  const match = source.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decode(match[1]) : null;
}

function createNode(className) {
  const node = {
    className,
    parent: null,
    children: [],
    listeners: {},
    attrs: {},
    focused: false,
    classList: {
      add() {},
      remove() {}
    },
    getAttribute(name) {
      return node.attrs[name] ?? null;
    },
    setAttribute(name, value) {
      node.attrs[name] = value;
    },
    addEventListener(type, fn) {
      (node.listeners[type] ||= []).push(fn);
    },
    focus() {
      node.focused = true;
    },
    matches(selector) {
      return selector === `.${className}` || selector.split('.').filter(Boolean).every(part => className.split(/\s+/).includes(part));
    },
    closest(selector) {
      let current = node;
      while (current) {
        if (current.matches?.(selector)) return current;
        current = current.parent;
      }
      return null;
    },
    contains(target) {
      let current = target;
      while (current) {
        if (current === node) return true;
        current = current.parent;
      }
      return false;
    },
    querySelector(selector) {
      return walk(node, item => item.matches?.(selector))[0] || null;
    },
    querySelectorAll(selector) {
      return walk(node, item => item.matches?.(selector));
    }
  };
  return node;
}

function walk(node, predicate, found = []) {
  if (predicate(node)) found.push(node);
  for (const child of node.children || []) walk(child, predicate, found);
  return found;
}

function append(parent, child) {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

function dispatch(target, type, init = {}) {
  const event = {
    target,
    type,
    key: init.key,
    repeat: Boolean(init.repeat),
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    }
  };
  let current = target;
  while (current) {
    event.currentTarget = current;
    for (const listener of current.listeners[type] || []) listener(event);
    current = current.parent;
  }
  return event;
}

function selectedValue(html, id) {
  const block = html.match(new RegExp(`<select\\b[^>]*\\bid="${id}"[\\s\\S]*?</select>`));
  if (!block) return '';
  const options = [...block[0].matchAll(/<option\b([^>]*)>/g)];
  const selected = options.find(option => /\bselected\b/.test(option[1])) || options[0];
  return selected ? (readAttr(selected[1], 'value') || '') : '';
}

function mountHtml(root, html) {
  root.innerHTMLValue = html;
  root.children = [];
  const byId = {};
  function register(id, node) {
    node.attrs.id = id;
    byId[id] = node;
    return node;
  }
  function mountButton(id) {
    const match = html.match(new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*>`));
    if (!match) return null;
    const node = register(id, append(root, createNode('')));
    node.disabled = /\bdisabled\b/.test(match[0]);
    return node;
  }
  function mountInput(id) {
    const match = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`));
    if (!match) return null;
    const node = register(id, append(root, createNode('')));
    node.value = readAttr(match[0], 'value') || '';
    return node;
  }
  function mountSelect(id) {
    if (!html.includes(`id="${id}"`)) return null;
    const node = register(id, append(root, createNode('')));
    node.value = selectedValue(html, id);
    return node;
  }
  function mountId(id) {
    if (!html.includes(`id="${id}"`)) return null;
    return register(id, append(root, createNode('')));
  }
  mountButton('review-export');
  mountButton('review-clear');
  mountButton('review-open-leaderboard');
  mountButton('review-back-personal');
  mountButton('leaderboard-submit');
  mountButton('leaderboard-retry');
  mountInput('leaderboard-ascension');
  mountInput('review-display-name');
  mountSelect('leaderboard-character');
  mountSelect('leaderboard-mode');
  mountId('leaderboard-form');
  mountId('review-name-form');
  const list = append(root, createNode('review-run-list'));
  const cardPattern = /<div class="(review-run-card[^"]*)"([^>]*)>/g;
  let cardMatch;
  while ((cardMatch = cardPattern.exec(html))) {
    const entry = append(list, createNode('review-run-entry'));
    const card = append(entry, createNode(cardMatch[1]));
    card.attrs['data-run-id'] = readAttr(cardMatch[2], 'data-run-id');
    card.attrs['aria-expanded'] = readAttr(cardMatch[2], 'aria-expanded');
    card.attrs['aria-controls'] = readAttr(cardMatch[2], 'aria-controls');
  }
  const board = append(root, createNode('leaderboard-list'));
  const rowPattern = /<div class="(leaderboard-row[^"]*)"([^>]*)>/g;
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html))) {
    const entry = append(board, createNode('leaderboard-entry'));
    const row = append(entry, createNode(rowMatch[1]));
    row.attrs['data-run-id'] = readAttr(rowMatch[2], 'data-run-id');
    row.attrs['aria-expanded'] = readAttr(rowMatch[2], 'aria-expanded');
    row.attrs['aria-controls'] = readAttr(rowMatch[2], 'aria-controls');
  }
  root.querySelector = selector => {
    if (selector.startsWith('#')) return byId[selector.slice(1)] || null;
    if (selector === '.review-run-list') return html.includes('review-run-list') ? list : null;
    if (selector === '.leaderboard-list') return html.includes('leaderboard-list') ? board : null;
    if (selector === '.review-run-card') return list.querySelector('.review-run-card');
    if (selector === '.leaderboard-row') return board.querySelector('.leaderboard-row');
    return null;
  };
  root.querySelectorAll = selector => {
    if (selector === '.review-run-card') return list.querySelectorAll('.review-run-card');
    if (selector === '.leaderboard-row') return board.querySelectorAll('.leaderboard-row');
    return [];
  };
  return { list, board };
}

function createRoot() {
  const root = createNode('root');
  let html = '';
  Object.defineProperty(root, 'innerHTML', {
    get() {
      return html;
    },
    set(value) {
      html = value;
      mountHtml(root, value);
    }
  });
  return root;
}

const windowScope = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'review-ui.js'), 'utf8'),
  { window: windowScope }
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'review-renderer.js'), 'utf8'),
  { window: windowScope }
);

const runs = [
  {
    runId: 'alpha',
    character: 'ironclad',
    result: 'win',
    bossName: '守护者',
    floor: 55,
    maxTurnDamage: 80,
    deck: [
      { id: 'STRIKE', name: '打击', upgraded: true },
      { id: 'STRIKE', name: '打击', upgraded: false }
    ],
    relics: [{ id: 'BURNING_BLOOD', name: '燃烧之血' }]
  },
  {
    runId: 'beta',
    character: 'silent',
    result: 'loss',
    bossName: '史莱姆',
    floor: 12,
    maxTurnDamage: 20,
    deck: [{ id: 'DAGGER', name: '匕首雨', upgraded: false }],
    relics: [{ id: 'RING', name: '蛇戒' }]
  }
];

const root = createRoot();
const controller = windowScope.GameBuddyReviewRenderer.createReviewController({
  root,
  toast: { textContent: '', classList: { add() {}, remove() {} } },
  ui: windowScope.GameBuddyReviewUi,
  bridge: {},
  confirm: () => false
});

controller.setDashboard({ recentRuns: runs });
assert.equal(controller.getExpandedRunId(), null);
assert.doesNotMatch(root.innerHTML, /燃烧之血/);

const [alpha, beta] = root.querySelectorAll('.review-run-card');
dispatch(alpha, 'click');
assert.equal(controller.getExpandedRunId(), 'alpha');
assert.match(root.innerHTML, /燃烧之血/);
assert.match(root.innerHTML, /打击/);
assert.doesNotMatch(root.innerHTML, /匕首雨/);
assert.doesNotMatch(root.innerHTML, /蛇戒/);
assert.equal(root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'alpha').focused, true);

const betaAfter = root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'beta');
dispatch(betaAfter, 'click');
assert.equal(controller.getExpandedRunId(), 'beta');
assert.match(root.innerHTML, /匕首雨/);
assert.match(root.innerHTML, /蛇戒/);
assert.doesNotMatch(root.innerHTML, /燃烧之血/);

const betaAgain = root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'beta');
const space = dispatch(betaAgain, 'keydown', { key: ' ' });
assert.equal(space.defaultPrevented, true);
assert.equal(controller.getExpandedRunId(), null);
assert.doesNotMatch(root.innerHTML, /匕首雨/);
assert.doesNotMatch(root.innerHTML, /终局牌组/);

const alphaAgain = root.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'alpha');
dispatch(alphaAgain, 'keydown', { key: 'Enter' });
assert.equal(controller.getExpandedRunId(), 'alpha');
assert.match(root.innerHTML, /燃烧之血/);
dispatch(alphaAgain, 'keydown', { key: 'Enter', repeat: true });
assert.equal(controller.getExpandedRunId(), 'alpha', 'Key repeat must not collapse the open run.');

controller.setDashboard({
  recentRuns: runs.map(run => ({ ...run, floor: run.floor + 1 }))
});
assert.equal(controller.getExpandedRunId(), 'alpha');
assert.match(root.innerHTML, /燃烧之血/);
assert.doesNotMatch(root.innerHTML, /蛇戒/);

controller.setDashboard({ recentRuns: [runs[1]] });
assert.equal(controller.getExpandedRunId(), null);
assert.doesNotMatch(root.innerHTML, /燃烧之血/);
assert.doesNotMatch(root.innerHTML, /aria-expanded="true"/);

function tick() {
  return new Promise(resolve => setImmediate(resolve));
}

function assertQuery(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), ['ascension', 'character', 'gameMode']);
  assert.equal(actual.character, expected.character);
  assert.equal(actual.ascension, expected.ascension);
  assert.equal(actual.gameMode, expected.gameMode);
}

function leaderboardItem(runId, displayName) {
  return {
    runId,
    displayName,
    observedDurationSeconds: 75,
    combatSaveLoad: true,
    finalDeck: [{ id: 'STRIKE_LB', upgraded: true }],
    finalRelics: [{ id: 'RELIC_LB' }],
    selectedEvents: [{ eventId: 'FISH', pageId: 'INITIAL', optionId: 'AGREE' }],
    playerId: 'player-should-stay-hidden'
  };
}

async function leaderboardInteractions() {
  const calls = [];
  const resolvers = [];
  const boardRoot = createRoot();
  const boardController = windowScope.GameBuddyReviewRenderer.createReviewController({
    root: boardRoot,
    toast: { textContent: '', classList: { add() {}, remove() {} } },
    ui: windowScope.GameBuddyReviewUi,
    bridge: {
      listLeaderboard(filters, ...rest) {
        calls.push({ filters, rest });
        return new Promise(resolve => resolvers.push(resolve));
      }
    },
    confirm: () => false
  });
  boardController.setProfile({ displayName: '阿达' });
  boardController.setDashboard({ recentRuns: runs, window: { wins: 2, losses: 1, abandoned: 0 }, mainCharacter: 'ironclad' });
  assert.match(boardRoot.innerHTML, /id="review-open-leaderboard"/);
  assert.equal(calls.length, 0);
  const alphaCard = boardRoot.querySelectorAll('.review-run-card').find(card => card.getAttribute('data-run-id') === 'alpha');
  dispatch(alphaCard, 'click');
  assert.equal(boardController.getExpandedRunId(), 'alpha');
  assert.match(boardRoot.innerHTML, /阿达/);

  dispatch(boardRoot.querySelector('#review-open-leaderboard'), 'click');
  assert.equal(calls.length, 1);
  assertQuery(calls[0].filters, { character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.deepEqual(calls[0].rest, []);
  assert.match(boardRoot.innerHTML, /正在读取通关榜…/);
  assert.match(boardRoot.innerHTML, /通关榜/);
  assert.equal(boardRoot.querySelector('#leaderboard-submit').disabled, true);
  assert.equal(boardController.getExpandedRunId(), 'alpha');
  dispatch(boardRoot.querySelector('#leaderboard-form'), 'submit');
  assert.equal(calls.length, 1, 'Loading must ignore the same query.');

  boardRoot.querySelector('#leaderboard-character').value = 'silent';
  boardRoot.querySelector('#leaderboard-ascension').value = '10';
  boardRoot.querySelector('#leaderboard-mode').value = 'Daily';
  dispatch(boardRoot.querySelector('#leaderboard-form'), 'submit');
  assert.equal(calls.length, 2);
  assertQuery(calls[1].filters, { character: 'silent', ascension: 10, gameMode: 'Daily' });
  resolvers[0]({
    ok: true,
    items: [leaderboardItem('late-run', '迟到选手')]
  });
  await tick();
  assert.doesNotMatch(boardRoot.innerHTML, /迟到选手/);
  resolvers[1]({
    ok: true,
    items: [leaderboardItem('fresh-run', '最新选手')]
  });
  await tick();
  assert.match(boardRoot.innerHTML, /最新选手/);
  assert.match(boardRoot.innerHTML, /01:15/);
  assert.doesNotMatch(boardRoot.innerHTML, /迟到选手/);
  assert.doesNotMatch(boardRoot.innerHTML, /player-should-stay-hidden/);

  boardController.setDashboard({
    recentRuns: runs,
    window: { wins: 2, losses: 1, abandoned: 0 },
    recoveryWarning: '缓存更新'
  });
  assert.match(boardRoot.innerHTML, /最新选手/);
  assert.doesNotMatch(boardRoot.innerHTML, /缓存更新/);
  assert.equal(boardController.getExpandedRunId(), 'alpha');

  dispatch(boardRoot.querySelector('#review-back-personal'), 'click');
  assert.match(boardRoot.innerHTML, /缓存更新/);
  assert.match(boardRoot.innerHTML, /阿达/);
  assert.match(boardRoot.innerHTML, /燃烧之血/);
  assert.equal(boardController.getExpandedRunId(), 'alpha');
  assert.doesNotMatch(boardRoot.innerHTML, /最新选手/);
  dispatch(boardRoot.querySelector('#review-open-leaderboard'), 'click');
  assert.equal(calls.length, 2, 'Returning must not send another leaderboard request.');
  assert.match(boardRoot.innerHTML, /最新选手/);

  for (const bad of ['-1', '10001', '1.5', '', '08', '10abc']) {
    boardRoot.querySelector('#leaderboard-ascension').value = bad;
    dispatch(boardRoot.querySelector('#leaderboard-form'), 'submit');
    assert.equal(calls.length, 2, bad);
    assert.match(boardRoot.innerHTML, /请修正筛选条件/);
  }
  boardRoot.querySelector('#leaderboard-character').value = 'nope';
  boardRoot.querySelector('#leaderboard-ascension').value = '3';
  boardRoot.querySelector('#leaderboard-mode').value = 'Standard';
  dispatch(boardRoot.querySelector('#leaderboard-form'), 'submit');
  assert.equal(calls.length, 2);
  assert.match(boardRoot.innerHTML, /请修正筛选条件/);

  boardRoot.querySelector('#leaderboard-character').value = 'defect';
  boardRoot.querySelector('#leaderboard-ascension').value = '4';
  boardRoot.querySelector('#leaderboard-mode').value = 'Custom';
  dispatch(boardRoot.querySelector('#leaderboard-form'), 'submit');
  assertQuery(calls[2].filters, { character: 'defect', ascension: 4, gameMode: 'Custom' });
  resolvers[2]({ ok: false, reason: 'timeout' });
  await tick();
  assert.match(boardRoot.innerHTML, /读取失败/);
  assert.ok(boardRoot.querySelector('#leaderboard-retry'));
  boardRoot.querySelector('#leaderboard-ascension').value = '99';
  dispatch(boardRoot.querySelector('#leaderboard-retry'), 'click');
  assertQuery(calls[3].filters, { character: 'defect', ascension: 4, gameMode: 'Custom' });
  assert.match(boardRoot.innerHTML, /value="4"/);
  resolvers[3]({
    ok: true,
    items: [leaderboardItem('keyed-run', '键盘选手')]
  });
  await tick();
  const row = boardRoot.querySelectorAll('.leaderboard-row')[0];
  dispatch(row, 'click');
  assert.match(boardRoot.innerHTML, /STRIKE_LB/);
  assert.match(boardRoot.innerHTML, /RELIC_LB/);
  assert.match(boardRoot.innerHTML, /FISH \/ INITIAL \/ AGREE/);
  assert.equal(boardRoot.querySelectorAll('.leaderboard-row')[0].focused, true);
  const openRow = boardRoot.querySelectorAll('.leaderboard-row')[0];
  const space = dispatch(openRow, 'keydown', { key: ' ' });
  assert.equal(space.defaultPrevented, true);
  assert.doesNotMatch(boardRoot.innerHTML, /STRIKE_LB/);
  const closedRow = boardRoot.querySelectorAll('.leaderboard-row')[0];
  dispatch(closedRow, 'keydown', { key: 'Enter' });
  assert.match(boardRoot.innerHTML, /STRIKE_LB/);
  dispatch(closedRow, 'keydown', { key: 'Enter', repeat: true });
  assert.match(boardRoot.innerHTML, /STRIKE_LB/);

  const thrown = [];
  const throwRoot = createRoot();
  const throwController = windowScope.GameBuddyReviewRenderer.createReviewController({
    root: throwRoot,
    toast: { textContent: '', classList: { add() {}, remove() {} } },
    ui: windowScope.GameBuddyReviewUi,
    bridge: {
      listLeaderboard(filters) {
        thrown.push(filters);
        if (thrown.length === 1) throw new Error('https://secret.example/down');
        return { ok: true, items: [] };
      }
    },
    confirm: () => false
  });
  throwController.setDashboard({ recentRuns: [] });
  dispatch(throwRoot.querySelector('#review-open-leaderboard'), 'click');
  assert.match(throwRoot.innerHTML, /读取失败/);
  assert.doesNotMatch(throwRoot.innerHTML, /secret\.example/);
  dispatch(throwRoot.querySelector('#leaderboard-retry'), 'click');
  await tick();
  assertQuery(thrown[1], { character: thrown[0].character, ascension: thrown[0].ascension, gameMode: thrown[0].gameMode });
  assertQuery(thrown[0], { character: 'ironclad', ascension: 0, gameMode: 'Standard' });
  assert.match(throwRoot.innerHTML, /当前条件下暂无通关记录/);
  dispatch(throwRoot.querySelector('#review-back-personal'), 'click');
  assert.match(throwRoot.innerHTML, /还没有本地对局记录/);
  assert.doesNotMatch(throwRoot.innerHTML, /当前条件下暂无通关记录/);
}

leaderboardInteractions().then(() => {
  console.log('Review renderer interaction tests passed.');
}).catch(error => {
  console.error(error);
  process.exit(1);
});
