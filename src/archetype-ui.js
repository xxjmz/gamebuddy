(function exposeArchetypeUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GameBuddyArchetypeUi = api;
}(typeof window !== 'undefined' ? window : globalThis, function createArchetypeUi() {
  const ORDER = Object.freeze(['auto_strike', 'exhaust', 'strength', 'block']);
  const ORDER_INDEX = new Map(ORDER.map((id, index) => [id, index]));

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

  function buildStatus(scores) {
    const valid = ordered(scores).filter(item => Number.isFinite(item?.score));
    if (!valid.length) return { kind: 'unformed', label: '尚未成型', archetypeIds: [] };
    const highest = Math.max(...valid.map(item => item.score));
    if (highest < 15) return { kind: 'unformed', label: '尚未成型', archetypeIds: [] };
    const leaders = valid.filter(item => item.score === highest);
    if (leaders.length === 1) {
      return { kind: 'primary', label: `主流派 · ${leaders[0].name}`, archetypeIds: [leaders[0].id] };
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
      Number(right.explicit === true) - Number(left.explicit === true)
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
      return `<div class="archetype-score${leader}"><div><span>${escapeHtml(item.name)}</span><strong>${score}</strong></div><div class="archetype-score-track"><span style="width:${score}%"></span></div></div>`;
    }).join('');
    return `<section class="archetype-overview archetype-iron-plate"><div class="archetype-overview-head"><strong>铁甲流派度</strong><span class="archetype-build-state ${status.kind}">${escapeHtml(status.label)}</span></div>${rows}<div class="archetype-win-note">流派度≠胜率</div></section>`;
  }

  function renderCardImpacts(impacts, scores) {
    const selected = selectCardImpacts(impacts, scores);
    if (!selected.length) return '';
    const rows = selected.map(item => {
      const delta = Math.round(item.deltaPoints);
      const before = Math.round(Number.isFinite(item.beforeScore) ? item.beforeScore : 0);
      const tone = delta > 0 ? 'positive' : 'negative';
      const signed = `${delta > 0 ? '+' : ''}${delta}`;
      return `<div class="archetype-impact ${tone}" title="流派度变化，单位为百分点；流派度≠胜率"><strong>${escapeHtml(item.name)} ${before}% ${signed}</strong><span>${escapeHtml(item.reason)}</span></div>`;
    }).join('');
    return `<div class="archetype-impacts">${rows}</div>`;
  }

  return {
    ORDER,
    escapeHtml,
    buildStatus,
    selectCardImpacts,
    renderOverview,
    renderCardImpacts
  };
}));
