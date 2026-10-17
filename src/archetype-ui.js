(function exposeArchetypeUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GameBuddyArchetypeUi = api;
}(typeof window !== 'undefined' ? window : globalThis, function createArchetypeUi() {
  const ORDER = Object.freeze(['auto_strike', 'exhaust', 'strength', 'block']);
  const ORDER_INDEX = new Map(ORDER.map((id, index) => [id, index]));
  const STAGE_LABELS = Object.freeze({ unformed: '未启动', started: '已启动', formed: '已成型' });
  const STAGE_RANK = Object.freeze({ unformed: 0, started: 1, formed: 2 });
  const AXIS_LABELS = Object.freeze({
    auto_gate: '自动打击核心',
    auto_loop: '抽牌循环',
    auto_payoff: '打击兑现',
    auto_ammo: '打击弹药',
    exhaust_pain: '消耗格挡',
    exhaust_draw: '消耗抽牌',
    exhaust_outlet: '消耗出口',
    exhaust_event: '批量消耗',
    exhaust_payoff: '消耗兑现',
    strength_source: '力量来源',
    strength_multihit: '多段输出',
    strength_balance: '力量攻防',
    block_gate: '格挡留存',
    block_conversion: '格挡转伤',
    block_source: '格挡来源'
  });

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ordered(items) {
    return [...(Array.isArray(items) ? items : [])]
      .sort((left, right) => (ORDER_INDEX.get(left?.id) ?? ORDER.length) - (ORDER_INDEX.get(right?.id) ?? ORDER.length));
  }

  function stageOf(item) {
    if (STAGE_LABELS[item?.stage]) return item.stage;
    if (item?.mature === true) return 'formed';
    if (item?.started === true || Number(item?.score) >= 15) return 'started';
    return 'unformed';
  }

  function buildStatus(scores) {
    const valid = ordered(scores).filter(item => Number.isFinite(item?.score));
    if (!valid.length) return { kind: 'unformed', label: '尚未成型', archetypeIds: [] };
    const highestStage = Math.max(...valid.map(item => STAGE_RANK[stageOf(item)]));
    if (highestStage === 0) return { kind: 'unformed', label: '尚未启动', archetypeIds: [] };
    const stageCandidates = valid.filter(item => STAGE_RANK[stageOf(item)] === highestStage);
    const highest = Math.max(...stageCandidates.map(item => item.score));
    const leaders = stageCandidates.filter(item => item.score === highest);
    if (leaders.length === 1) {
      return {
        kind: 'primary',
        label: `主流派 · ${leaders[0].name} · ${STAGE_LABELS[stageOf(leaders[0])]}`,
        archetypeIds: [leaders[0].id]
      };
    }
    return { kind: 'mixed', label: '混合构筑', archetypeIds: leaders.map(item => item.id) };
  }

  function selectCardImpacts(impacts, scores) {
    const candidates = ordered(impacts).filter(item => Number.isFinite(item?.deltaPoints) && item.deltaPoints !== 0);
    if (!candidates.length) return [];
    const explicit = candidates.filter(item => item.explicit === true);
    if (!explicit.length) {
      const scoreById = new Map((scores || []).map(item => [item.id, Number(item.score) || 0]));
      return [candidates.sort((left, right) => (
        (scoreById.get(right.id) || 0) - (scoreById.get(left.id) || 0)
        || (ORDER_INDEX.get(left.id) ?? ORDER.length) - (ORDER_INDEX.get(right.id) ?? ORDER.length)
      ))[0]];
    }
    return candidates.sort((left, right) => (
      Number((STAGE_RANK[right.afterStage] || 0) > (STAGE_RANK[right.beforeStage] || 0))
        - Number((STAGE_RANK[left.afterStage] || 0) > (STAGE_RANK[left.beforeStage] || 0))
      || Number(right.explicit === true) - Number(left.explicit === true)
      || Math.abs(right.deltaPoints) - Math.abs(left.deltaPoints)
      || (ORDER_INDEX.get(left.id) ?? ORDER.length) - (ORDER_INDEX.get(right.id) ?? ORDER.length)
    )).slice(0, 2);
  }

  function renderOverview(scores) {
    const valid = ordered(scores).filter(item => Number.isFinite(item?.score));
    if (!valid.length) return '';
    const status = buildStatus(valid);
    const rows = valid.map(item => {
      const score = Math.max(0, Math.min(100, Math.round(item.score)));
      const leader = status.archetypeIds.includes(item.id) ? ' leader' : '';
      return `<div class="archetype-score${leader}"><div><span>${escapeHtml(item.name)} · ${STAGE_LABELS[stageOf(item)]}</span><strong>${score} 点</strong></div><div class="archetype-score-track"><span style="width:${score}%"></span></div></div>`;
    }).join('');
    return `<section class="archetype-overview archetype-iron-plate"><div class="archetype-overview-head"><strong>铁甲构筑进度</strong><span class="archetype-build-state ${status.kind}">${escapeHtml(status.label)}</span></div>${rows}<div class="archetype-win-note">构筑点不是胜率</div></section>`;
  }

  function renderCardImpacts(impacts, scores) {
    const selected = selectCardImpacts(impacts, scores);
    if (!selected.length) return '';
    const rows = selected.map(item => {
      const delta = Math.round(item.deltaPoints);
      const before = Math.round(Number.isFinite(item.beforeScore) ? item.beforeScore : 0);
      const after = Math.round(Number.isFinite(item.afterScore) ? item.afterScore : before + delta);
      const tone = delta > 0 ? 'positive' : 'negative';
      const signed = `${delta > 0 ? '+' : ''}${delta}`;
      const transitioned = (STAGE_RANK[item.afterStage] || 0) > (STAGE_RANK[item.beforeStage] || 0);
      const milestone = transitioned ? ` · ${STAGE_LABELS[item.afterStage]}` : '';
      const axes = Array.isArray(item.completedAxes) && item.completedAxes.length
        ? `补齐：${item.completedAxes.map(axis => AXIS_LABELS[axis] || axis).join('、')}`
        : item.reason;
      return `<div class="archetype-impact ${tone}${transitioned ? ' milestone' : ''}" title="构筑点变化；构筑点不是胜率"><strong>${escapeHtml(item.name)} ${before} → ${after}（${signed}）${milestone}</strong><span>${escapeHtml(axes)}</span></div>`;
    }).join('');
    return `<div class="archetype-impacts">${rows}</div>`;
  }

  return {
    ORDER,
    STAGE_LABELS,
    AXIS_LABELS,
    escapeHtml,
    buildStatus,
    selectCardImpacts,
    renderOverview,
    renderCardImpacts
  };
}));
