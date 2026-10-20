(function attachReviewRenderer(globalScope) {
  const CHARACTERS = ['ironclad', 'silent', 'defect', 'regent', 'necrobinder'];
  const GAME_MODES = ['Standard', 'Daily', 'Custom'];
  const DEFAULT_QUERY = { character: 'ironclad', ascension: 0, gameMode: 'Standard' };

  function parseAscension(value) {
    if (typeof value === 'number') {
      if (!Number.isInteger(value) || value < 0 || value > 10000) return null;
      return value;
    }
    const text = String(value ?? '').trim();
    if (!/^(0|[1-9]\d*)$/.test(text)) return null;
    const parsed = Number(text);
    if (!Number.isInteger(parsed) || parsed > 10000) return null;
    return parsed;
  }

  function parseQuery(draft) {
    const character = String(draft?.character || '');
    const gameMode = String(draft?.gameMode || '');
    if (!CHARACTERS.includes(character) || !GAME_MODES.includes(gameMode)) return { error: 'filters' };
    const ascension = parseAscension(draft?.ascension);
    if (ascension == null) return { error: 'ascension' };
    return { value: { character, ascension, gameMode } };
  }

  function sameQuery(left, right) {
    return Boolean(left && right && left.character === right.character && left.ascension === right.ascension && left.gameMode === right.gameMode);
  }

  function createReviewController(options) {
    const root = options.root;
    const toast = options.toast;
    const ui = options.ui;
    const bridge = options.bridge;
    const confirmFn = options.confirm || (message => globalScope.confirm(message));
    const schedule = options.setTimeout || ((fn, delay) => globalScope.setTimeout(fn, delay));
    const cancel = options.clearTimeout || (id => globalScope.clearTimeout(id));
    let dashboard = null;
    let profile = { displayName: '匿名人士' };
    let expandedRunId = null;
    let toastTimer;
    let view = 'personal';
    let draftFilters = { character: 'ironclad', ascension: '0', gameMode: 'Standard' };
    let submittedFilters = null;
    let leaderboardStatus = 'idle';
    let leaderboardItems = [];
    let expandedLeaderboardRunId = null;
    let filterError = '';
    let leaderboardActivated = false;
    let requestSeq = 0;
    let inFlightFilters = null;

    function runs() {
      return Array.isArray(dashboard?.recentRuns) ? dashboard.recentRuns : [];
    }

    function retainExpanded() {
      if (expandedRunId == null) return;
      if (!runs().some(run => run.runId === expandedRunId)) expandedRunId = null;
    }

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('show');
      cancel(toastTimer);
      toastTimer = schedule(() => toast.classList.remove('show'), 2300);
    }

    function focusRun(runId) {
      const cards = root.querySelectorAll?.('.review-run-card') || [];
      for (const card of cards) {
        if (card.getAttribute('data-run-id') === runId) {
          card.focus?.();
          return;
        }
      }
    }

    function focusLeaderboard(runId) {
      const rows = root.querySelectorAll?.('.leaderboard-row') || [];
      for (const row of rows) {
        if (row.getAttribute('data-run-id') === runId) {
          row.focus?.();
          return;
        }
      }
    }

    function leaderboardModel() {
      return {
        filters: draftFilters,
        status: leaderboardStatus,
        items: leaderboardItems,
        expandedRunId: expandedLeaderboardRunId,
        filterError
      };
    }

    function render(renderOptions = {}) {
      if (view === 'personal') retainExpanded();
      root.innerHTML = view === 'leaderboard'
        ? (ui?.renderLeaderboard?.(leaderboardModel()) || '')
        : (ui?.render(dashboard, expandedRunId, profile) || '');
      bindActions();
      if (view === 'personal' && renderOptions.restoreFocus && expandedRunId) focusRun(expandedRunId);
      if (view === 'leaderboard' && renderOptions.restoreFocus && expandedLeaderboardRunId) focusLeaderboard(expandedLeaderboardRunId);
    }

    function applyLeaderboardResult(result) {
      if (!result || result.ok !== true || !Array.isArray(result.items)) {
        leaderboardStatus = 'error';
        leaderboardItems = [];
        expandedLeaderboardRunId = null;
        return;
      }
      leaderboardItems = result.enabled === false ? [] : result.items;
      expandedLeaderboardRunId = null;
      leaderboardStatus = result.enabled === false ? 'closed' : (leaderboardItems.length ? 'success' : 'empty');
    }

    async function queryLeaderboard(filters) {
      const seq = ++requestSeq;
      inFlightFilters = filters;
      submittedFilters = filters;
      leaderboardStatus = 'loading';
      filterError = '';
      expandedLeaderboardRunId = null;
      render();
      let result;
      try {
        result = await bridge?.listLeaderboard?.({
          character: filters.character,
          ascension: filters.ascension,
          gameMode: filters.gameMode
        });
      } catch {
        result = { ok: false, reason: 'network_error' };
      }
      if (seq !== requestSeq) return;
      applyLeaderboardResult(result);
      render();
    }

    function readDraft() {
      return {
        character: root.querySelector('#leaderboard-character')?.value ?? draftFilters.character,
        ascension: root.querySelector('#leaderboard-ascension')?.value ?? draftFilters.ascension,
        gameMode: root.querySelector('#leaderboard-mode')?.value ?? draftFilters.gameMode
      };
    }

    function openLeaderboard() {
      view = 'leaderboard';
      if (!leaderboardActivated) {
        leaderboardActivated = true;
        draftFilters = {
          character: DEFAULT_QUERY.character,
          ascension: String(DEFAULT_QUERY.ascension),
          gameMode: DEFAULT_QUERY.gameMode
        };
        void queryLeaderboard(DEFAULT_QUERY);
        return;
      }
      render();
    }

    function showPersonal() {
      view = 'personal';
      render();
    }

    function submitLeaderboard(event) {
      event.preventDefault();
      draftFilters = readDraft();
      const parsed = parseQuery(draftFilters);
      if (!parsed.value) {
        filterError = parsed.error;
        render();
        return;
      }
      if (leaderboardStatus === 'loading' && sameQuery(parsed.value, inFlightFilters)) return;
      void queryLeaderboard(parsed.value);
    }

    function retryLeaderboard() {
      if (!submittedFilters || leaderboardStatus === 'loading') return;
      draftFilters = {
        character: submittedFilters.character,
        ascension: String(submittedFilters.ascension),
        gameMode: submittedFilters.gameMode
      };
      void queryLeaderboard(submittedFilters);
    }

    function activateRun(runId) {
      if (!runId) return;
      expandedRunId = expandedRunId === runId ? null : runId;
      render({ restoreFocus: true });
    }

    function activateLeaderboardRun(runId) {
      if (!runId) return;
      expandedLeaderboardRunId = expandedLeaderboardRunId === runId ? null : runId;
      render({ restoreFocus: true });
    }

    function runCardFromEvent(event) {
      const list = event.currentTarget;
      const card = event.target?.closest?.('.review-run-card');
      if (!card || !list?.contains(card)) return null;
      return card;
    }

    function leaderboardRowFromEvent(event) {
      const list = event.currentTarget;
      const row = event.target?.closest?.('.leaderboard-row');
      if (!row || !list?.contains(row)) return null;
      return row;
    }

    function onRunListClick(event) {
      const card = runCardFromEvent(event);
      if (!card) return;
      activateRun(card.getAttribute('data-run-id'));
    }

    function onRunListKeydown(event) {
      if (event.repeat) return;
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      const card = runCardFromEvent(event);
      if (!card || event.target !== card) return;
      event.preventDefault();
      activateRun(card.getAttribute('data-run-id'));
    }

    function onLeaderboardClick(event) {
      const row = leaderboardRowFromEvent(event);
      if (!row) return;
      activateLeaderboardRun(row.getAttribute('data-run-id'));
    }

    function onLeaderboardKeydown(event) {
      if (event.repeat) return;
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      const row = leaderboardRowFromEvent(event);
      if (!row || event.target !== row) return;
      event.preventDefault();
      activateLeaderboardRun(row.getAttribute('data-run-id'));
    }

    function bindActions() {
      root.querySelector('#review-name-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const input = root.querySelector('#review-display-name');
        const typed = String(input?.value || '').trim().slice(0, 16) || '匿名人士';
        const result = await bridge?.savePlayerProfile?.(typed);
        profile = { displayName: result?.displayName || typed };
        render();
        showToast(`榜上名称已保存：${profile.displayName}`);
      });
      root.querySelector('#review-export')?.addEventListener('click', async () => {
        const result = await bridge?.exportReview?.();
        showToast(result?.ok ? '个人数据已导出' : '已取消导出');
      });
      root.querySelector('#review-clear')?.addEventListener('click', async () => {
        if (!confirmFn('确认清空本机全部个人数据？此操作不能撤销。')) return;
        const token = await bridge?.requestReviewClear?.();
        const result = await bridge?.clearReview?.(token);
        if (!result?.ok) {
          showToast('清空失败，请重试');
          return;
        }
        expandedRunId = null;
        dashboard = result.dashboard;
        render();
        showToast('本机个人数据已清空');
      });
      const list = root.querySelector('.review-run-list');
      list?.addEventListener('click', onRunListClick);
      list?.addEventListener('keydown', onRunListKeydown);
      root.querySelector('#review-open-leaderboard')?.addEventListener('click', openLeaderboard);
      root.querySelector('#review-back-personal')?.addEventListener('click', showPersonal);
      root.querySelector('#leaderboard-form')?.addEventListener('submit', submitLeaderboard);
      root.querySelector('#leaderboard-retry')?.addEventListener('click', retryLeaderboard);
      const board = root.querySelector('.leaderboard-list');
      board?.addEventListener('click', onLeaderboardClick);
      board?.addEventListener('keydown', onLeaderboardKeydown);
    }

    function setDashboard(nextDashboard) {
      dashboard = nextDashboard;
      render();
    }

    function setProfile(nextProfile) {
      profile = { displayName: nextProfile?.displayName || '匿名人士' };
    }

    return {
      setDashboard,
      setProfile,
      activateRun,
      getExpandedRunId: () => expandedRunId
    };
  }

  globalScope.GameBuddyReviewRenderer = { createReviewController };

  const documentRef = globalScope.document;
  const root = documentRef?.querySelector?.('#review-root');
  if (!root) return;

  const controller = createReviewController({
    root,
    toast: documentRef.querySelector('#toast'),
    ui: globalScope.GameBuddyReviewUi,
    bridge: globalScope.gamebuddyBridge,
    confirm: message => globalScope.confirm(message)
  });

    async function loadDashboard() {
    let dashboard;
    try {
      dashboard = await globalScope.gamebuddyBridge?.getReviewDashboard?.();
    } catch {
      dashboard = { recoveryWarning: '个人数据暂时无法读取，请关闭窗口后重试。' };
    }
    try {
      const saved = await globalScope.gamebuddyBridge?.getPlayerProfile?.();
      if (saved?.displayName) controller.setProfile(saved);
    } catch {
      // 名称读取失败时保留默认匿名人士。
    }
    controller.setDashboard(dashboard);
  }

  documentRef.querySelector('#minimize-button')?.addEventListener('click', () => globalScope.windowControls?.minimize());
  documentRef.querySelector('#close-button')?.addEventListener('click', () => globalScope.windowControls?.close());
  globalScope.gamebuddyBridge?.onReviewChanged(nextDashboard => {
    controller.setDashboard(nextDashboard);
  });
  void loadDashboard();
})(typeof window !== 'undefined' ? window : globalThis);
