(function attachReviewUi(globalScope) {
  const CHARACTER_NAMES = {
    ironclad: '铁甲战士',
    silent: '静默猎手',
    defect: '故障机器人',
    regent: '统御者',
    necrobinder: '死灵法师'
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function characterName(id) {
    return CHARACTER_NAMES[String(id || '').toLowerCase()] || id || '等待第一局';
  }

  function characterImage(id) {
    const safe = Object.prototype.hasOwnProperty.call(CHARACTER_NAMES, id) ? id : 'ironclad';
    return `./assets/pets/${safe}/advising.png`;
  }

  function point(index, radius, center = 160) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    return [center + Math.cos(angle) * radius, center + Math.sin(angle) * radius];
  }

  function pointsForRadius(radius) {
    return Array.from({ length: 5 }, (_, index) => point(index, radius).map(value => value.toFixed(1)).join(',')).join(' ');
  }

  function radar(dashboard) {
    const axes = dashboard.axes || [];
    const enough = dashboard.sampleSize >= 3;
    const complete = enough && axes.length === 5 && axes.every(axis => Number.isFinite(axis.value));
    const missing=axes.filter(axis=>!Number.isFinite(axis.value)).map(axis=>axis.label);
    const pending=enough ? `已记录 ${dashboard.sampleSize} 局，等待${missing.length?escapeHtml(missing.join('、')):'更多行为'}数据`
      : dashboard.sampleSize ? `再完成 ${Math.max(0, 3-dashboard.sampleSize)} 局即可生成五星图` : '完成对局后生成五星图';
    const valuePoints = complete
      ? axes.map((axis, index) => point(index, 115 * Math.max(0, Math.min(100, axis.value)) / 100).map(value => value.toFixed(1)).join(',')).join(' ')
      : '';
    const labels = axes.map((axis, index) => {
      const [x, y] = point(index, 145);
      const anchor = x < 125 ? 'end' : x > 195 ? 'start' : 'middle';
      const value = Number.isFinite(axis.value) ? `${Math.round(axis.value)}` : '暂无';
      return `<text class="review-radar-label" x="${x}" y="${y}" text-anchor="${anchor}">
        <tspan x="${x}" dy="0">${escapeHtml(axis.label)}</tspan>
        <tspan class="review-radar-value" x="${x}" dy="17">${value}</tspan>
      </text>`;
    }).join('');
    return `
      <div class="review-radar-wrap">
        <svg class="review-radar" viewBox="0 0 320 320" role="img" aria-label="玩家最近对局的五星玩法倾向">
          ${[23, 46, 69, 92, 115].map(radius => `<polygon class="review-radar-grid" points="${pointsForRadius(radius)}"></polygon>`).join('')}
          ${Array.from({ length: 5 }, (_, index) => {
            const [x, y] = point(index, 115);
            return `<line class="review-radar-axis" x1="160" y1="160" x2="${x}" y2="${y}"></line>`;
          }).join('')}
          ${complete ? `<polygon class="review-radar-data" points="${valuePoints}"></polygon>` : ''}
          ${labels}
        </svg>
        ${complete ? '' : `<div class="review-radar-empty">${pending}</div>`}
      </div>`;
  }

  function statRows(stats) {
    return (stats || []).map(stat => {
      if(stat.kind==='count')return `<div class="review-stat-row review-stat-count-row"><div class="review-stat-copy"><strong>${escapeHtml(stat.label)}</strong><span>最近 ${stat.sampleSize ?? 0} 局</span></div><span class="review-streak-rule" aria-hidden="true"></span><b>${Math.max(0,Math.round(Number(stat.value)||0))}<small> 连胜</small></b></div>`;
      const known = Number.isFinite(stat.value);
      const detail = stat.id === 'progress'
        ? (known ? `均值 · ${stat.denominator}局` : '暂无')
        : (stat.denominator > 0 ? `${stat.numerator}/${stat.denominator}` : '暂无');
      return `
        <div class="review-stat-row">
          <div class="review-stat-copy"><strong>${escapeHtml(stat.label)}</strong><span>${detail}</span></div>
          <div class="review-stat-track" aria-label="${escapeHtml(stat.label)} ${known ? `${Math.round(stat.value)}%` : '暂无'}">
            <span style="width:${known ? Math.max(2, Math.min(100, stat.value)) : 0}%"></span>
          </div>
          <b>${known ? `${Math.round(stat.value)}%` : '--'}</b>
        </div>`;
    }).join('');
  }

  function resultLabel(result) {
    if (result === 'win') return ['通关', 'win'];
    if (result === 'abandoned') return ['放弃', 'abandoned'];
    return result === 'loss' ? ['未通关', 'loss'] : ['结果未知', 'unknown'];
  }

  function displayName(item) {
    const name = String(item?.name || '').trim();
    const id = String(item?.id || '').trim();
    return name || id || '未知';
  }

  function buildCollection(title, items, emptyText, countUnit) {
    const missing = !Array.isArray(items);
    const count = missing ? '' : `<span>${items.length} ${countUnit}</span>`;
    let body;
    if (missing) body = `<p class="review-build-empty">旧记录未包含此数据</p>`;
    else if (!items.length) body = `<p class="review-build-empty">${emptyText}</p>`;
    else if (countUnit === '张') {
      body = `<div class="review-build-grid">${items.map(card => `
        <span class="review-card-chip"><span class="review-card-name">${escapeHtml(displayName(card))}</span>${card?.upgraded ? '<span class="review-card-upgrade" aria-label="已升级">+</span>' : ''}</span>`).join('')}</div>`;
    } else {
      body = `<div class="review-build-grid">${items.map(relic => `<span class="review-relic-badge">${escapeHtml(displayName(relic))}</span>`).join('')}</div>`;
    }
    return `
      <section class="review-build-section">
        <div class="review-build-heading"><strong>${title}</strong>${count}</div>
        ${body}
      </section>`;
  }

  function runBuild(run, panelId) {
    return `
      <div class="review-run-build" id="${panelId}" role="region" aria-label="终局牌组与遗物" data-run-id="${escapeHtml(run.runId)}">
        ${buildCollection('终局牌组', run.deck, '本局没有记录到牌组', '张')}
        ${buildCollection('终局遗物', run.relics, '本局没有记录到遗物', '件')}
      </div>`;
  }

  function recentRuns(runs, expandedRunId = null) {
    if (!runs?.length) {
      return `<div class="review-no-runs"><strong>还没有本地对局记录</strong><span>开始一局《杀戮尖塔 2》，GameBuddy 会自动记录到这里。</span></div>`;
    }
    return runs.map((run, index) => {
      const [label, className] = resultLabel(run.result);
      const panelId = `review-run-build-${index}`;
      const expanded = expandedRunId != null && run.runId === expandedRunId;
      return `
        <div class="review-run-entry">
          <div class="review-run-card${expanded ? ' is-expanded' : ''}" role="button" tabindex="0" data-run-id="${escapeHtml(run.runId)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${panelId}">
            <img src="${characterImage(run.character)}" alt="" />
            <div class="review-run-character"><strong>${escapeHtml(characterName(run.character))}</strong><span class="review-result ${className}">${label}</span></div>
            <div><span>${run.encounterKind === 'killer' ? '死于' : '关底 BOSS'}</span><strong>${escapeHtml(run.bossName || '未知')}</strong></div>
            <div><span>最终楼层</span><strong>${Number.isFinite(run.floor) ? `${run.floor} 层` : '未知'}</strong></div>
            <div><span>最高单回合伤害</span><strong>${Number.isFinite(run.maxTurnDamage) ? run.maxTurnDamage : '未知'}</strong></div>
          </div>
          ${expanded ? runBuild(run, panelId) : ''}
        </div>`;
    }).join('');
  }

  function render(dashboard, expandedRunId = null, profile = null) {
    const displayName = profile?.displayName || '匿名人士';
    const safe = dashboard || { window: {}, axes: [], stats: [], recentRuns: [] };
    const character = safe.mainCharacter || 'ironclad';
    return `
      <section class="review-page" aria-label="个人数据">
        <div class="review-pattern" aria-hidden="true"></div>
        <header class="review-header">
          <div class="review-score-pill">
            <span class="review-score-number">${safe.window?.wins || 0}</span>
            <span class="review-score-copy">胜局<small>/ ${safe.window?.wins + safe.window?.losses || 0} 局有结果</small></span>
            ${safe.window?.abandoned ? `<span class="review-abandoned-count">放弃 ${safe.window.abandoned} 局</span>` : ''}
          </div>
          <div class="review-brand"><strong>GAMEBUDDY</strong><span>个人数据</span></div>
          <div class="review-identity">
            <form class="review-name" id="review-name-form">
              <label for="review-display-name">榜上名称</label>
              <input id="review-display-name" name="displayName" maxlength="16" value="${escapeHtml(displayName)}" autocomplete="nickname">
              <button type="submit">保存</button>
            </form>
            <div class="review-actions">
              <span>仅保存在本机</span>
              <button type="button" id="review-open-leaderboard">排行榜</button>
              <button type="button" id="review-export">导出</button>
              <button type="button" id="review-clear">清空</button>
            </div>
          </div>
        </header>

        ${safe.recoveryWarning ? `<div class="review-warning">${escapeHtml(safe.recoveryWarning)}</div>` : ''}

        <div class="review-hero">
          <section class="review-character-panel">
            <div class="review-ribbon"><span>MAIN CHARACTER</span><strong>主角色</strong></div>
            <div class="review-character-stage">
              <div class="review-character-name"><span>最近 50 局最常使用</span><strong>${escapeHtml(characterName(safe.mainCharacter))}</strong></div>
              <img src="${characterImage(character)}" alt="${escapeHtml(characterName(safe.mainCharacter))}" />
              <div class="review-character-shadow"></div>
              <div class="review-character-stamp">${safe.mainCharacterSampleSize ?? safe.sampleSize ?? 0}<small>局使用</small></div>
            </div>
          </section>

          <section class="review-data-panel">
            <div class="review-ribbon right"><span>PLAY STYLE</span><strong>玩法五星图</strong></div>
            <div class="review-radar-card">${radar(safe)}<span class="review-radar-scope">全角色 · 最近 ${safe.sampleSize || 0} 局</span></div>
            <div class="review-ribbon compact"><span>RECENT MATCHES</span><strong>最近的 50 场对局</strong></div>
            <div class="review-stats">${statRows(safe.stats)}</div>
          </section>
        </div>

        <section class="review-history">
          <div class="review-history-heading"><strong>最近游戏记录</strong><span>角色 · 通关状态 · BOSS · 楼层 · 单回合伤害</span></div>
          <div class="review-run-list">${recentRuns(safe.recentRuns, expandedRunId)}</div>
        </section>
      </section>`;
  }

  function formatDuration(seconds) {
    if (!Number.isInteger(seconds) || seconds < 0) return '未知';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const clock = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return hours > 0 ? `${String(hours).padStart(2, '0')}:${clock}` : clock;
  }

  function formatStartedAt(value) {
    if (!Number.isInteger(value) || value < 0) return '未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未知';
    const pad = part => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function leaderboardName(value) {
    const name = String(value ?? '').trim();
    return name || '匿名人士';
  }

  function leaderboardCards(deck) {
    if (!Array.isArray(deck) || !deck.length) return '<p class="leaderboard-empty">无记录</p>';
    return `<div class="review-build-grid">${deck.map(card => {
      const id = escapeHtml(card && typeof card === 'object' ? (card.id || '未知') : '未知');
      const upgraded = Boolean(card && typeof card === 'object' && card.upgraded === true);
      return `<span class="review-card-chip"><span class="review-card-name">${id}</span>${upgraded ? '<span class="review-card-upgrade" aria-label="已升级">+</span>' : ''}</span>`;
    }).join('')}</div>`;
  }

  function leaderboardRelics(relics) {
    if (!Array.isArray(relics) || !relics.length) return '<p class="leaderboard-empty">无记录</p>';
    return `<div class="review-build-grid">${relics.map(relic => {
      const id = escapeHtml(relic && typeof relic === 'object' ? (relic.id || '未知') : '未知');
      return `<span class="review-relic-badge">${id}</span>`;
    }).join('')}</div>`;
  }

  function leaderboardEvents(events) {
    if (!Array.isArray(events) || !events.length) return '<p class="leaderboard-empty">无记录</p>';
    const lines = events
      .filter(event => event && typeof event === 'object' && !Array.isArray(event))
      .map(event => `${escapeHtml(event.eventId ?? '')} / ${escapeHtml(event.pageId ?? '')} / ${escapeHtml(event.optionId ?? '')}`);
    if (!lines.length) return '<p class="leaderboard-empty">无记录</p>';
    return `<ul class="leaderboard-events">${lines.map(line => `<li>${line}</li>`).join('')}</ul>`;
  }

  function leaderboardSection(title, body) {
    return `<section class="review-build-section"><div class="review-build-heading"><strong>${title}</strong></div>${body}</section>`;
  }

  function leaderboardDetail(item, panelId) {
    return `
      <div class="leaderboard-detail" id="${panelId}" role="region" aria-label="通关详情">
        ${leaderboardSection('开始时间', `<p class="leaderboard-empty">${formatStartedAt(item?.startedAt)}</p>`)}
        ${leaderboardSection('终局牌组', leaderboardCards(item?.finalDeck))}
        ${leaderboardSection('终局遗物', leaderboardRelics(item?.finalRelics))}
        ${leaderboardSection('事件选择', leaderboardEvents(item?.selectedEvents))}
      </div>`;
  }

  function leaderboardRows(items, expandedRunId) {
    return (items || []).map((item, index) => {
      const runKey = item?.runId == null ? `row-${index}` : String(item.runId);
      const expanded = expandedRunId != null && String(expandedRunId) === runKey;
      const panelId = `leaderboard-detail-${index}`;
      const name = leaderboardName(item?.displayName);
      const duration = formatDuration(item?.observedDurationSeconds);
      const saveLabel = item?.combatSaveLoad === true ? '有战斗内读档' : '无战斗内读档';
      const rank = index + 1;
      return `
        <div class="leaderboard-entry">
          <div class="leaderboard-row${expanded ? ' is-expanded' : ''}" role="button" tabindex="0" data-run-id="${escapeHtml(runKey)}" aria-expanded="${expanded ? 'true' : 'false'}" aria-controls="${panelId}" aria-label="第 ${rank} 名 ${escapeHtml(name)} ${duration} ${saveLabel}">
            <b class="leaderboard-rank">${rank}</b>
            <strong class="leaderboard-name">${escapeHtml(name)}</strong>
            <span class="leaderboard-time">${duration}</span>
            <span class="leaderboard-save">${saveLabel}</span>
          </div>
          ${expanded ? leaderboardDetail(item, panelId) : ''}
        </div>`;
    }).join('');
  }

  const LEADERBOARD_CHARACTERS = [
    ['ironclad', '铁甲战士'],
    ['silent', '静默猎手'],
    ['defect', '故障机器人'],
    ['regent', '统御者'],
    ['necrobinder', '死灵法师']
  ];
  const LEADERBOARD_MODES = [
    ['Standard', '标准'],
    ['Daily', '每日'],
    ['Custom', '自定义']
  ];

  function leaderboardOptions(options, current) {
    return options.map(([value, label]) => (
      `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`
    )).join('');
  }

  function renderLeaderboard(state = {}) {
    const filters = state.filters || { character: 'ironclad', ascension: '0', gameMode: 'Standard' };
    const status = state.status || 'idle';
    let results = '';
    if (status === 'loading') {
      results = '<p class="leaderboard-status" role="status">正在读取排行榜…</p>';
    } else if (status === 'error') {
      results = '<div class="leaderboard-status" role="alert"><p>排行榜读取失败</p><button type="button" id="leaderboard-retry">重试</button></div>';
    } else if (status === 'empty') {
      results = '<p class="leaderboard-status" role="status">当前条件下暂无排行记录</p>';
    } else if (status === 'success') {
      results = `
        <div class="leaderboard-columns" aria-hidden="true"><span>名次</span><span>榜上名称</span><span>观察用时</span><span>战斗内读档</span></div>
        <div class="leaderboard-list">${leaderboardRows(state.items, state.expandedRunId)}</div>`;
    }
    const alert = state.filterError
      ? `<p class="leaderboard-filter-error" role="alert">请修正筛选条件。${state.filterError === 'ascension' ? '进阶需为 0 到 10000 的整数。' : '请检查角色和模式。'}</p>`
      : '';
    return `
      <section class="review-page leaderboard-page" aria-label="排行榜">
        <div class="review-pattern" aria-hidden="true"></div>
        <header class="leaderboard-header">
          <button type="button" id="review-back-personal">返回个人数据</button>
          <h1 class="leaderboard-title">排行榜</h1>
        </header>
        <form class="leaderboard-filters" id="leaderboard-form">
          <label>角色<select id="leaderboard-character" name="character">${leaderboardOptions(LEADERBOARD_CHARACTERS, filters.character)}</select></label>
          <label>进阶<input id="leaderboard-ascension" name="ascension" type="number" min="0" max="10000" step="1" inputmode="numeric" value="${escapeHtml(filters.ascension)}"></label>
          <label>模式<select id="leaderboard-mode" name="gameMode">${leaderboardOptions(LEADERBOARD_MODES, filters.gameMode)}</select></label>
          <button type="submit" id="leaderboard-submit"${status === 'loading' ? ' disabled' : ''}>查询</button>
        </form>
        <div class="leaderboard-results">${alert}${results}</div>
      </section>`;
  }

  globalScope.GameBuddyReviewUi = { render, renderLeaderboard, characterName, pointsForRadius };
})(window);
