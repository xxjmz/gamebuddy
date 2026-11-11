const { inspectSubject, observedPayload, observedRelations } = require('./facts');
const { checkClaim } = require('./claims');
const { titleReportsCombatValue, wordingIssue } = require('./editorial');

function story(timeline, candidate) {
  const p = candidate || {};
  const fact = timeline.byId.get(p.eventId);
  if (!fact || fact.runId !== timeline.runId) return null;
  if ((p.pattern === 'upgrade_not_used' || p.pattern === 'upgrade_no_energy') && fact.eventType === 'rest.action_completed'
    && observedPayload(fact).action === 'smith' && observedPayload(fact).cardInstanceId) {
    const after = timeline.facts.indexOf(fact);
    const next = timeline.facts.slice(after + 1).find(row => row.eventType === 'combat.started');
    const combat = next && timeline.combats.get(next.combatId);
    if (!combat || observedPayload(combat.ended).victory !== false) return null;
    const id = fact.payload.cardInstanceId;
    const inspection = inspectSubject(timeline, id, next.combatId);
    if (!inspection.neverPlayed) return null;
    const name = String(fact.payload.cardName || fact.payload.cardId || '那张牌');
    if (p.pattern === 'upgrade_no_energy') {
      const draw = combat.events.find(row => row.eventType === 'card.drawn' && row.payload?.cardInstanceId === id
        && row.payload?.unavailableReason === 'insufficient_energy' && row.payload?.playable === false
        && Number.isFinite(row.payload?.cost) && Number.isFinite(row.payload?.energyAtDraw)
        && row.payload.energyAtDraw < row.payload.cost);
      if (!draw) return null;
      return { pattern: p.pattern, verifiedKind: p.pattern, title: '终于等到，没能量',
        body: `${name}终于上手，当时能量不足，这场直到结束也没打出。`,
        evidenceIds: [fact.eventId, draw.eventId, combat.ended.eventId],
        subjectId: id, location: next.combatId };
    }
    if (!inspection.neverEnteredHand) return null;
    return { pattern: p.pattern, verifiedKind: p.pattern, title: '升级了，没用上',
      body: `刚升级的${name}，下一场战斗直到结束也没上手。`,
      evidenceIds: [fact.eventId, next.eventId, combat.ended.eventId],
      subjectId: id, location: next.combatId };
  }
  if (p.pattern === 'overkill' && fact.eventType === 'damage.resolved') {
    const data = observedPayload(fact);
    const resolved = data.resolvedDamageBeforeHpCap;
    const hp = data.targetHpBefore;
    if (!Number.isFinite(resolved) || !Number.isFinite(hp) || hp <= 0 || resolved <= hp
      || data.fatal !== true || !/^(player|hero|ally)$/i.test(String(data.sourceSide || ''))
      || !/^(enemy|monster|hostile)$/i.test(String(data.targetSide || ''))) return null;
    return { pattern: p.pattern, verifiedKind: p.pattern, title: '有点用力过猛',
      body: `目标只剩${hp}血，这次命中结算了${resolved}点伤害。`,
      evidenceIds: [fact.eventId], subjectId: data.targetEntityId || fact.eventId, location: fact.combatId };
  }
  return null;
}

function groundedStory(timeline, candidate, diagnostic = {}, { canonicalizeRelations = true } = {}) {
  const reject = (reason, detail) => { Object.assign(diagnostic, { reason, ...(detail ? { detail } : {}) }); return null; };
  if (!candidate || typeof candidate !== 'object') return reject('invalid_candidate');
  if (!candidate.bodyTemplate) {
    const card = story(timeline, candidate);
    return card || reject('insufficient_story_evidence');
  }
  const { title, bodyTemplate, assertions = [], evidenceIds = [], bindings = {} } = candidate;
  if (typeof title !== 'string' || typeof bodyTemplate !== 'string' || !Array.isArray(assertions)
    || !Array.isArray(evidenceIds) || !bindings || typeof bindings !== 'object') return reject('invalid_schema');
  if (titleReportsCombatValue(title)) return reject('combat_value_in_title', '标题改写成贴合本局的反差或调侃，具体血量、伤害等战斗数值可留在正文。');
  let valid = true;
  const body = bodyTemplate.replace(/\{\{([a-zA-Z][\w]*)\}\}/g, (_match, name) => {
    const index = bindings[name]?.claimIndex;
    const claim = Number.isInteger(index) ? assertions[index] : null;
    const value = claim?.value;
    if (typeof value !== 'string' && typeof value !== 'number') { valid = false; return ''; }
    if (claim.type === 'event_field' && /^(cardId|potionId|relicId)$/.test(claim.field || '')) {
      const catalog = claim.field === 'cardId' ? require('../../agent/data/codex/cards.json')
        : claim.field === 'potionId' ? require('../../agent/data/codex/potions.json') : require('../../agent/data/codex/relics.json');
      return catalog.find(item => item.id === value)?.name || String(value);
    }
    return String(value);
  });
  if (!valid || /\{\{|\}\}/.test(title + body)) return reject('invalid_binding', '占位符须指向可显示的文本或数字，也可直接写成自然正文。');
  const wording = wordingIssue(title + ' ' + body);
  if (wording) return reject(wording);
  if (/阵亡|临死|死前|战死|(?:玩家|角色|你|自己)(?:已经|最终|当场)?(?:死亡|死了)/.test(title + ' ' + body)) {
    const citedCombats = evidenceIds.map(id => timeline.byId.get(id)?.combatId);
    const deathClaims = assertions.filter(claim => claim?.type === 'combat_outcome' && claim.value === 'death');
    const combatIds = new Set([candidate.combatId, ...citedCombats, ...deathClaims.map(claim => claim.combatId)].filter(Boolean));
    if (![...combatIds].some(combatId => checkClaim(timeline, { type: 'combat_outcome', combatId, value: 'death' }).status === 'supported'))
      return reject('unproved_player_death');
  }
  const relationIds = [...new Set(assertions.filter(c => c?.type === 'recorded_relation').map(c => c.relationId))];
  if (canonicalizeRelations && relationIds.length === 1
    && assertions.every(c => ['recorded_relation', 'event_field', 'sequence', 'occurred'].includes(c?.type))) {
    const relation = observedRelations(timeline).find(r => r.relationId === relationIds[0]);
    const canonical = relation && relationCandidate(relation);
    if (canonical) {
      const rendered = groundedStory(timeline, canonical, diagnostic, { canonicalizeRelations: false });
      return rendered && { ...rendered, rendering: 'canonical_known_relation', verifiedKind: relation.kind };
    }
  }
  return { pattern: candidate.pattern || 'observed_moment', title, body, evidenceIds,
    assertions, relationId: relationIds.length === 1 ? relationIds[0] : null,
    ...(relationIds.length === 1 ? { verifiedKind: observedRelations(timeline).find(r => r.relationId === relationIds[0])?.kind, rendering: 'model_voice_verified_relation' } : {}),
    location: candidate.combatId || '', subjectId: candidate.subjectId || null };
}

function selectStories(timeline, candidates, { deduplicate = true, preserveModelVoice = false } = {}) {
  const seenEvidence = new Set(), selected = [];
  for (const candidate of Array.isArray(candidates) ? candidates.slice(0, 12) : []) {
    const card = groundedStory(timeline, candidate, {}, { canonicalizeRelations: !preserveModelVoice });
    if (!card || !card.title.trim() || !card.body.trim()
      || deduplicate && storyKeys(timeline, card).some(id => seenEvidence.has(id))) continue;
    storyKeys(timeline, card).forEach(id => seenEvidence.add(id)); selected.push(card);
    if (selected.length === (deduplicate ? 3 : 12)) break;
  }
  return selected;
}
function storyKeys(timeline, card) {
  const actionIds = card.evidenceIds.filter(id => !/^(combat\.(started|ended)|run\.ended|context\.snapshot)$/.test(timeline.byId.get(id)?.eventType || ''));
  return actionIds.length ? actionIds : card.evidenceIds;
}
function storyPriority(card) {
  return ({ fairy_kept_rescue: 110, rest_choice_style: 92, resource_choice_style: 91,
    health_recovery: 100, overkill: 95, upgrade_not_used: 90, upgrade_no_energy: 90,
    rest_max_hp_growth: 75, low_hp_inventory: 20 })[card.verifiedKind] ?? 80;
}
function highValueLocalStory(card) {
  return card?.verifiedKind !== 'low_hp_inventory';
}
function localStories(timeline, { highValueOnly = false } = {}) {
  const candidates = timeline.facts.flatMap(f => f.eventType === 'rest.action_completed'
    ? [{ pattern: 'upgrade_no_energy', eventId: f.eventId }, { pattern: 'upgrade_not_used', eventId: f.eventId }]
    : f.eventType === 'damage.resolved' ? [{ pattern: 'overkill', eventId: f.eventId }] : []);
  // Filter before the bounded model-candidate selector. A long run can contain
  // hundreds of ordinary damage events before its first actual story.
  const relations = observedRelations(timeline).map(relationCandidate).filter(Boolean);
  const all = [...relations, ...candidates.filter(candidate => story(timeline, candidate))]
    .sort((a, b) => storyPriority({ verifiedKind: b.pattern }) - storyPriority({ verifiedKind: a.pattern }));
  const selected = selectStories(timeline, all);
  return highValueOnly ? selected.filter(highValueLocalStory) : selected;
}
function relationCandidate(relation) {
  const { kind, fields, relationId, evidenceIds } = relation;
  const definitions = {
    fairy_kept_rescue: { title: '瓶中精灵，留对了', bodyTemplate: '没拿{{potionName}}换稀有牌。{{floorGap}}层后{{entryHp}}血进双Boss战仍归零，幸好它来捞人。', fields: ['potionName', 'floorGap', 'entryHp'] },
    rest_choice_style: { title: '火堆是你的家', bodyTemplate: '{{restCount}}次火堆全选回血，{{healthyHp}}/{{healthyMaxHp}}血也不打铁。升级能等，养生不能耽误。', fields: ['restCount', 'healthyHp', 'healthyMaxHp'] },
    resource_choice_style: { title: '惜命不惜债', bodyTemplate: '半血不拿{{bloodCost}}血换遗物，揣着{{gold}}金币却选背债。血得护着，债先欠着。', fields: ['bloodCost', 'gold'] },
    health_recovery: { title: '血条归零又亮起', bodyTemplate: '生命一度降到{{hpBefore}}，随后又回到{{hpAfter}}血。', fields: ['hpBefore', 'hpAfter'] },
    rest_max_hp_growth: { title: '休息也在长血条', bodyTemplate: '记录内{{restCount}}次休息，生命上限每次增加{{perRestGain}}，合计增加{{totalGain}}。', fields: ['restCount', 'perRestGain', 'totalGain'] },
    low_hp_inventory: { title: '药水还在背包', bodyTemplate: '结束前最后记录只剩{{hp}}血，背包仍有{{potionCount}}瓶药水。', fields: ['hp', 'potionCount'] }
  };
  const d = definitions[kind];
  if (!d) return null;
  if (kind === 'health_recovery' && Number.isInteger(fields.nextAct)) {
    d.bodyTemplate = '生命从{{hpBefore}}回到{{hpAfter}}血，接着走进了第{{nextAct}}幕。';
    d.fields = ['hpBefore', 'hpAfter', 'nextAct'];
  }
  // Prefer concrete names when they fit the compact local fallback template.
  if (kind === 'low_hp_inventory' && fields.potionNames && fields.potionCount === 2
    && [...`最后记录只剩${fields.hp}血，${fields.potionNames}仍在背包。`].length <= 40) {
    d.bodyTemplate = '最后记录只剩{{hp}}血，{{potionNames}}仍在背包。'; d.fields = ['hp', 'potionNames'];
  }
  if (kind === 'low_hp_inventory' && Number.isFinite(fields.hpEarlier) && fields.hpEarlier > fields.hp) {
    d.title = '血线告急，背包有货';
    d.bodyTemplate = '这场{{hpEarlier}}血打到只剩{{hp}}；背包里，还有{{potionCount}}瓶药水。';
    d.fields = ['hpEarlier', 'hp', 'potionCount'];
    if (fields.enemyName && [...`对上${fields.enemyName}，${fields.hpEarlier}血打到只剩${fields.hp}；背包里，还有${fields.potionCount}瓶药水。`].length <= 40) {
      d.bodyTemplate = '对上{{enemyName}}，{{hpEarlier}}血打到只剩{{hp}}；背包里，还有{{potionCount}}瓶药水。';
      d.fields = ['enemyName', ...d.fields];
    }
  }
  return { pattern: kind, relationId, title: d.title, bodyTemplate: d.bodyTemplate, evidenceIds,
    assertions: d.fields.map(field => ({ type: 'recorded_relation', relationId, field, value: fields[field] })),
    bindings: Object.fromEntries(d.fields.map((field, claimIndex) => [field, { claimIndex }])) };
}

function localClosing(cards) {
  const kinds = new Set(cards.map(c => c.verifiedKind).filter(Boolean));
  if (kinds.has('fairy_kept_rescue') && kinds.has('rest_choice_style') && kinds.has('resource_choice_style'))
    return '火堆边养生，事件里背债，Boss面前靠精灵续命——这局，命是真硬。';
  if (kinds.has('fairy_kept_rescue')) return '当初留下的瓶中精灵，后来真的替你续上了命。';
  if (kinds.has('rest_choice_style') && kinds.has('resource_choice_style')) return '火堆边养生，事件里背债：这局主打一个惜命不惜债。';
  if (kinds.has('rest_choice_style')) return '牌能慢慢升，血得先补好，这局把稳健写在了篝火边。';
  if (kinds.has('resource_choice_style')) return '血条得护着，债可以先欠着：这局的账算得很有个性。';
  if (kinds.has('health_recovery') && kinds.has('rest_max_hp_growth')) return '血条归零后再次亮起，多次休息也积累了更长的生命上限。';
  if (kinds.has('health_recovery')) return '血条曾经归零，随后又重新亮起。';
  if (kinds.has('rest_max_hp_growth')) return '多次休息，积累出了更长的生命上限。';
  if (kinds.has('low_hp_inventory')) return '血条在告急，背包却还没见底。';
  return cards.length ? '这些选择与转折，留下了值得回味的片段。' : '';
}
function localPortrait(cards) {
  const kinds = new Set(cards.map(c => c.verifiedKind));
  if (kinds.has('rest_choice_style') && kinds.has('resource_choice_style')) return '惜命不惜债';
  if (kinds.has('fairy_kept_rescue')) return '福大命大的爬塔客';
  if (kinds.has('rest_choice_style')) return '篝火边的养生派';
  if (kinds.has('resource_choice_style')) return '血条精打细算，欠债另说';
  return '';
}
function candidateDiagnostics(timeline, candidates, { preserveModelVoice = false } = {}) {
  return (Array.isArray(candidates) ? candidates.slice(0, 12) : []).map((c, index) => {
    const diagnostic = {}, card = groundedStory(timeline, c, diagnostic, { canonicalizeRelations: !preserveModelVoice });
    if (card && (!card.title.trim() || !card.body.trim())) diagnostic.reason = 'empty_card_text';
    return { index, title: c?.title, accepted: Boolean(card && !diagnostic.reason), ...diagnostic,
    bindings: Object.entries(c?.bindings || {}).map(([name, binding]) => ({ name, claimIndex: binding?.claimIndex,
      valid: Number.isInteger(binding?.claimIndex) && Boolean(c?.assertions?.[binding.claimIndex]),
      field: c?.assertions?.[binding?.claimIndex]?.field })),
    reminder: '保留故事本身的措辞。删改断言时同步更新绑定索引，或直接写正文。' };
  });
}
module.exports = { story, groundedStory, selectStories, localStories, highValueLocalStory,
  candidateDiagnostics, storyKeys, storyPriority, localClosing, localPortrait };
