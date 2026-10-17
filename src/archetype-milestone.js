(function registerArchetypeMilestone(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GameBuddyArchetypeMilestone = api;
}(typeof window !== 'undefined' ? window : globalThis, function buildArchetypeMilestone() {
  const ARCHETYPE_ORDER = ['auto_strike', 'exhaust', 'strength', 'block'];
  const ARCHETYPE_LABELS = {
    auto_strike: '自动打击',
    exhaust: '消耗引擎',
    strength: '力量叠加',
    block: '格挡壁垒'
  };
  const AXIS_LABELS = {
    auto_gate: '自动打击核心',
    auto_loop: '抽牌循环',
    auto_ammo: '打击弹药',
    auto_payoff: '打击兑现',
    exhaust_pain: '消耗格挡',
    exhaust_draw: '消耗抽牌',
    exhaust_outlet: '消耗出口',
    exhaust_event: '批量消耗',
    exhaust_payoff: '消耗兑现',
    strength_source: '力量来源',
    strength_multihit: '多段输出',
    strength_balance: '力量攻防',
    block_source: '格挡来源',
    block_gate: '格挡留存',
    block_conversion: '格挡转伤'
  };
  const STAGE_RANK = { unformed: 0, started: 1, formed: 2 };

  function transitionFor(archetype) {
    if (!archetype || !(archetype.id in ARCHETYPE_LABELS)) return null;
    if ((STAGE_RANK[archetype.afterStage] ?? -1) <= (STAGE_RANK[archetype.beforeStage] ?? -1)) return null;
    return {
      id: archetype.id,
      name: ARCHETYPE_LABELS[archetype.id],
      beforeStage: archetype.beforeStage,
      afterStage: archetype.afterStage,
      completedAxes: Array.isArray(archetype.completedAxes) ? archetype.completedAxes : []
    };
  }

  function buildFeedback(impact, selection) {
    const transitions = (impact?.archetypes || [])
      .map(transitionFor)
      .filter(Boolean)
      .sort((left, right) => {
        const stage = STAGE_RANK[right.afterStage] - STAGE_RANK[left.afterStage];
        return stage || ARCHETYPE_ORDER.indexOf(left.id) - ARCHETYPE_ORDER.indexOf(right.id);
      });
    if (!transitions.length) return null;

    const formed = transitions.some(item => item.afterStage === 'formed');
    const names = transitions.map(item => item.name).join('、');
    const axes = [...new Set(transitions.flatMap(item => item.completedAxes))]
      .map(axis => AXIS_LABELS[axis])
      .filter(Boolean);
    const suffix = formed ? '核心循环完整了' : axes.length ? `${axes.slice(0, 2).join('、')}接上了` : '已经开始运转';
    return {
      signature: selection.signature,
      cardId: selection.cardId,
      upgraded: selection.upgraded,
      level: formed ? 'formed' : 'started',
      title: formed ? '流派成型' : '流派启动',
      message: `${names}：${suffix}。`,
      transitions
    };
  }

  function createArchetypeMilestoneTracker() {
    const impactsBySignature = new Map();
    const confirmed = new Set();
    return {
      cache(message) {
        if (!message?.signature || !Array.isArray(message.impacts)) return;
        impactsBySignature.set(message.signature, new Map(
          message.impacts.map(impact => [String(impact.cardId), impact])
        ));
      },
      confirm(selection) {
        if (!selection?.signature || !selection?.cardId || typeof selection.upgraded !== 'boolean') return null;
        const key = `${selection.signature}\0${selection.cardId}\0${selection.upgraded}`;
        if (confirmed.has(key)) return null;
        confirmed.add(key);
        return buildFeedback(impactsBySignature.get(selection.signature)?.get(String(selection.cardId)), selection);
      },
      clear(signature) {
        impactsBySignature.delete(signature);
      }
    };
  }

  return { ARCHETYPE_ORDER, buildFeedback, createArchetypeMilestoneTracker };
}));
