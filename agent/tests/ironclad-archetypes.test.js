const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cards = require('../data/codex/cards.json');
const {
  ARCHETYPES,
  IRONCLAD_ARCHETYPE_MATRIX,
  validateMatrix,
  scoreIroncladArchetypes,
  impactIroncladArchetypes,
  decorateIroncladArchetypes,
  generateMatrixMarkdown,
  isIronclad
} = require('../knowledge/ironclad-archetypes');

const defend = { id: 'DEFEND_IRONCLAD' };
const filler = count => Array.from({ length: count }, () => ({ ...defend }));
const neutral = count => Array.from({ length: count }, () => ({ id: 'MANGLE' }));
const deckOf = (...ids) => ids.map(id => ({ id }));
const focusedDecks = {
  auto_strike: deckOf(
    'HELLRAISER', 'POMMEL_STRIKE', 'PILLAGE', 'PERFECTED_STRIKE', 'TWIN_STRIKE',
    'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'BASH', 'SHRUG_IT_OFF', 'OFFERING'
  ),
  exhaust: deckOf(
    'FEEL_NO_PAIN', 'DARK_EMBRACE', 'BURNING_PACT', 'TRUE_GRIT', 'FIEND_FIRE',
    'PACTS_END', 'HOWL_FROM_BEYOND', 'CORRUPTION', 'OFFERING', 'IMPERVIOUS'
  ),
  strength: deckOf(
    'INFLAME', 'DEMON_FORM', 'TWIN_STRIKE', 'WHIRLWIND', 'SWORD_BOOMERANG',
    'CONFLAGRATION', 'FIGHT_ME', 'BATTLE_TRANCE', 'OFFERING', 'BLOODLETTING'
  ),
  block: deckOf(
    'BARRICADE', 'UNMOVABLE', 'BODY_SLAM', 'JUGGERNAUT', 'IMPERVIOUS',
    'BLOOD_WALL', 'FLAME_BARRIER', 'SHRUG_IT_OFF', 'TAUNT', 'OFFERING'
  )
};
const score = (deck, id, relics = []) => scoreIroncladArchetypes(deck, relics)
  .find(item => item.id === id).score;
const state = (deck, id, relics = []) => scoreIroncladArchetypes(deck, relics)
  .find(item => item.id === id);
const impact = (deck, candidate, id) => impactIroncladArchetypes(deck, [], candidate)
  .find(item => item.id === id);

test('矩阵与 Codex 的 87 张铁甲牌严格一致且每张显式覆盖四套', () => {
  const codexIds = cards.filter(card => card.color === 'ironclad').map(card => card.id).sort();
  const matrixIds = Object.keys(IRONCLAD_ARCHETYPE_MATRIX).sort();
  assert.equal(codexIds.length, 87);
  assert.deepEqual(matrixIds, codexIds);
  for (const id of matrixIds) {
    assert.deepEqual(Object.keys(IRONCLAD_ARCHETYPE_MATRIX[id]).sort(), ARCHETYPES.map(item => item.key).sort());
    for (const cell of Object.values(IRONCLAD_ARCHETYPE_MATRIX[id])) {
      assert.equal(typeof cell.role, 'string');
      assert.equal(typeof cell.group, 'string');
      assert.equal(typeof cell.weight, 'number');
      assert.equal(typeof cell.reason, 'string');
    }
  }
  assert.equal(Object.values(IRONCLAD_ARCHETYPE_MATRIX)
    .flatMap(Object.values).filter(cell => cell.role === 'hardPoison').length, 0);
});

test('矩阵校验拒绝未知角色、原因、条件和缺失流派键', () => {
  const base = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  base.BASH.autoStrike.role = 'winner';
  assert.throws(() => validateMatrix(base), /invalid role/);
  const badReason = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  badReason.BASH.autoStrike.reasonCode = 'made_up';
  assert.throws(() => validateMatrix(badReason), /invalid reason/);
  const badCondition = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  badCondition.BASH.autoStrike.condition = 'arbitrary_js';
  assert.throws(() => validateMatrix(badCondition), /invalid condition/);
  const missing = structuredClone(IRONCLAD_ARCHETYPE_MATRIX);
  delete missing.BASH.block;
  assert.throws(() => validateMatrix(missing), /must explicitly define/);
});

test('专注构筑成型且高于全卡杂牌堆', () => {
  const allCards = cards.filter(card => card.color === 'ironclad');
  const doubledPile = [...allCards, ...allCards];
  const mixed = [
    ...focusedDecks.strength.slice(0, 5),
    ...focusedDecks.block.slice(0, 5),
    ...neutral(10)
  ];
  for (const archetype of ARCHETYPES) {
    const focused = state(focusedDecks[archetype.id], archetype.id);
    const pile = state(allCards, archetype.id);
    assert.equal(focused.stage, 'formed', `${archetype.id} focused stage`);
    assert.equal(focused.mature, true, `${archetype.id} legacy mature`);
    assert.ok(focused.score > pile.score, `${archetype.id} focused ${focused.score} pile ${pile.score}`);
    assert.notEqual(pile.stage, 'formed', `${archetype.id} all-card pile`);
    assert.notEqual(state(doubledPile, archetype.id).stage, 'formed', `${archetype.id} doubled pile`);
  }
  assert.ok(scoreIroncladArchetypes(mixed).every(item => item.stage !== 'formed'));
});

test('起手和缺闸门组件保留潜力但不误报启动', () => {
  const starter = deckOf(
    'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD', 'STRIKE_IRONCLAD',
    'STRIKE_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD', 'DEFEND_IRONCLAD',
    'DEFEND_IRONCLAD', 'BASH'
  );
  assert.ok(state(starter, 'auto_strike').score > 0);
  for (const [id, deck] of Object.entries({
    auto_strike: deckOf('POMMEL_STRIKE', 'PILLAGE', 'TWIN_STRIKE', ...Array(7).fill('MANGLE')),
    exhaust: deckOf('BURNING_PACT', 'FIEND_FIRE', 'PACTS_END', ...Array(7).fill('MANGLE')),
    strength: deckOf('TWIN_STRIKE', 'WHIRLWIND', 'CONFLAGRATION', ...Array(7).fill('MANGLE')),
    block: deckOf('BODY_SLAM', 'IMPERVIOUS', 'BLOOD_WALL', ...Array(7).fill('MANGLE'))
  })) {
    const result = state(deck, id);
    assert.ok(result.score > 0, `${id} potential`);
    assert.equal(result.stage, 'unformed', `${id} stage`);
  }
});

test('四套只有补齐最小闭环才能跨过 60 点启动线', () => {
  const cases = {
    auto_strike: {
      incomplete: deckOf('HELLRAISER', ...Array(9).fill('MANGLE')),
      complete: deckOf('HELLRAISER', 'POMMEL_STRIKE', ...Array(8).fill('MANGLE'))
    },
    exhaust: {
      incomplete: deckOf('FEEL_NO_PAIN', ...Array(9).fill('MANGLE')),
      complete: deckOf('FEEL_NO_PAIN', 'BURNING_PACT', ...Array(8).fill('MANGLE'))
    },
    strength: {
      incomplete: deckOf('INFLAME', ...Array(9).fill('MANGLE')),
      complete: deckOf('INFLAME', 'TWIN_STRIKE', ...Array(8).fill('MANGLE'))
    },
    block: {
      incomplete: deckOf('BARRICADE', 'IMPERVIOUS', ...Array(8).fill('MANGLE')),
      complete: deckOf('BARRICADE', 'BODY_SLAM', 'IMPERVIOUS', ...Array(7).fill('MANGLE'))
    }
  };
  for (const [id, decks] of Object.entries(cases)) {
    const incomplete = state(decks.incomplete, id);
    const complete = state(decks.complete, id);
    assert.ok(incomplete.score <= 59, `${id} incomplete ${incomplete.score}`);
    assert.equal(incomplete.stage, 'unformed', `${id} incomplete stage`);
    assert.ok(complete.score >= 60 && complete.score < 85, `${id} complete ${complete.score}`);
    assert.equal(complete.stage, 'started', `${id} complete stage`);
  }
});

test('60 点后由理想覆盖与稳定性拉开，85 点以上才可成型', () => {
  for (const archetype of ARCHETYPES) {
    const result = state(focusedDecks[archetype.id], archetype.id);
    assert.ok(result.score >= 85 && result.score < 100, `${archetype.id} focused ${result.score}`);
    assert.equal(result.stage, 'formed');
    assert.ok(result.consistency >= 60);
  }
});

test('中性过渡牌只影响闭环稳定性，反协同仍降低蓝图覆盖', () => {
  const compact = deckOf('HELLRAISER', 'POMMEL_STRIKE', ...Array(8).fill('MANGLE'));
  const thick = [...compact, ...neutral(20)];
  const compactState = state(compact, 'auto_strike');
  const thickState = state(thick, 'auto_strike');
  assert.equal(thickState.blueprintScore, compactState.blueprintScore);
  assert.ok(thickState.consistency < compactState.consistency);
  assert.ok(thickState.score < compactState.score);

  const withNeutral = state([...compact, { id: 'MANGLE' }], 'auto_strike');
  const withConflict = state([...compact, { id: 'ANGER' }], 'auto_strike');
  assert.ok(withConflict.blueprintScore < withNeutral.blueprintScore);
});

test('混合牌组可以独立启动多套闭环', () => {
  const mixed = deckOf(
    'FEEL_NO_PAIN', 'BURNING_PACT',
    'INFLAME', 'TWIN_STRIKE',
    ...Array(6).fill('MANGLE')
  );
  const results = scoreIroncladArchetypes(mixed);
  assert.equal(results.find(item => item.id === 'exhaust').stage, 'started');
  assert.equal(results.find(item => item.id === 'strength').stage, 'started');
});

test('升级有效张数更高、重复边际递减且厚牌降低 setup', () => {
  const base = [{ id: 'HELLRAISER' }, ...filler(18)];
  const normal = impact(base, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const once = [...base, { id: 'POMMEL_STRIKE' }];
  const upgraded = impact(neutral(10), { id: 'POMMEL_STRIKE', upgraded: true }, 'auto_strike').deltaPoints;
  const potentialNormal = impact(neutral(10), { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const twice = [...once, { id: 'POMMEL_STRIKE' }];
  const first = normal;
  const second = impact(once, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const third = impact(twice, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  assert.ok(upgraded > potentialNormal);
  assert.ok(first > second && second > third);
  assert.ok(score([...once, ...filler(12)], 'auto_strike') < score(once, 'auto_strike'));
  assert.deepEqual(scoreIroncladArchetypes(base, []).map(item => item.id), ARCHETYPES.map(item => item.id));
});

test('自动打击不再把主动误用风险当作无条件硬毒', () => {
  const base = [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, ...filler(18)];
  for (const id of ['DEMON_FORM', 'FIEND_FIRE', 'CORRUPTION', 'BRAND', 'HAVOC', 'PRIMAL_FORCE']) {
    const result = impact(base, { id }, 'auto_strike');
    assert.notEqual(result.role, 'hardPoison');
    assert.ok(result.deltaPoints >= -2, `${id} should not be a large fixed penalty`);
  }
  assert.ok(impact(base, { id: 'IRON_WAVE' }, 'auto_strike').deltaPoints <= 0);
});

test('自动打击区分稳定支持、条件支持和真实软反', () => {
  const matrix = IRONCLAD_ARCHETYPE_MATRIX;
  const base = [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, ...filler(18)];
  assert.equal(matrix.INFLAME.autoStrike.role, 'support');
  assert.ok(impact(base, { id: 'INFLAME' }, 'auto_strike').deltaPoints > 0);
  assert.equal(matrix.BATTLE_TRANCE.autoStrike.role, 'conditional');
  assert.equal(matrix.STOKE.autoStrike.role, 'conditional');
  assert.equal(matrix.PRIMAL_FORCE.autoStrike.role, 'softAnti');
  for (const id of ['ARMAMENTS', 'BASH', 'BREAK', 'TAUNT', 'THUNDERCLAP', 'TREMBLE', 'UPPERCUT', 'ONE_TWO_PUNCH']) {
    assert.notEqual(matrix[id].autoStrike.role, 'neutral', `${id} should have an explicit auto-strike role`);
  }
  assert.equal(matrix.BASH.autoStrike.reasonCode, 'auto_vulnerable');
  assert.ok(impact(base, { id: 'BASH' }, 'auto_strike').deltaPoints > 0);
});

test('初始牌组的自动打击弹药先积累潜力，闸门再释放协同', () => {
  const starter = [
    ...Array.from({ length: 5 }, () => ({ id: 'STRIKE_IRONCLAD' })),
    ...filler(4),
    { id: 'BASH' }
  ];
  const twin = impact(starter, { id: 'TWIN_STRIKE' }, 'auto_strike').deltaPoints;
  const taunt = impact(starter, { id: 'TAUNT' }, 'auto_strike').deltaPoints;
  const blankGate = impact(neutral(10), { id: 'HELLRAISER' }, 'auto_strike').deltaPoints;
  const componentGate = impact(
    [{ id: 'TWIN_STRIKE' }, { id: 'POMMEL_STRIKE' }, ...neutral(8)],
    { id: 'HELLRAISER' },
    'auto_strike'
  ).deltaPoints;
  assert.ok(twin > 0 && twin >= taunt);
  assert.ok(componentGate > blankGate);
  assert.equal(state([...starter, { id: 'TWIN_STRIKE' }], 'auto_strike').started, false);
});

test('消耗出口、事件和兑现无闸门仍正向，双闸门逐级放大', () => {
  const noGate = neutral(10);
  const oneGate = [{ id: 'FEEL_NO_PAIN' }, ...neutral(9)];
  const twoGates = [{ id: 'FEEL_NO_PAIN' }, { id: 'DARK_EMBRACE' }, ...neutral(8)];
  for (const id of ['BURNING_PACT', 'FIEND_FIRE', 'PACTS_END']) {
    const none = impact(noGate, { id }, 'exhaust').deltaPoints;
    const one = impact(oneGate, { id }, 'exhaust').deltaPoints;
    const two = impact(twoGates, { id }, 'exhaust').deltaPoints;
    assert.ok(none > 0, `${id} should retain potential without gates`);
    assert.ok(one >= none, `${id} should not lose value with one gate`);
    assert.ok(
      impact(twoGates, { id }, 'exhaust').afterScore > impact(oneGate, { id }, 'exhaust').afterScore,
      `${id} should finish higher with both gates`
    );
  }
  assert.equal(state([
    { id: 'BURNING_PACT' }, { id: 'FIEND_FIRE' }, { id: 'PACTS_END' }, ...neutral(7)
  ], 'exhaust').started, false);
});

test('力量多段无来源仍正向，有来源更高且重复递减', () => {
  const noSource = impact(neutral(10), { id: 'CONFLAGRATION' }, 'strength').deltaPoints;
  const withSourceDeck = [{ id: 'INFLAME' }, ...neutral(9)];
  const withSource = impact(withSourceDeck, { id: 'CONFLAGRATION' }, 'strength').deltaPoints;
  const repeated = impact(
    [...withSourceDeck, { id: 'CONFLAGRATION' }],
    { id: 'CONFLAGRATION' },
    'strength'
  ).deltaPoints;
  assert.ok(noSource > 0);
  assert.ok(withSource > noSource);
  assert.ok(withSource > repeated && repeated > 0);
  const missingSource = state([
    { id: 'TWIN_STRIKE' }, { id: 'WHIRLWIND' }, { id: 'CONFLAGRATION' }, ...neutral(7)
  ], 'strength');
  assert.ok(missingSource.score > 0, 'missing gate must not erase collected components');
  assert.equal(missingSource.started, false);
  assert.equal(missingSource.mature, false);
});

test('格挡来源和转伤先积累潜力，闸门与三轴组合最高', () => {
  const noGate = neutral(10);
  assert.ok(impact(noGate, { id: 'IMPERVIOUS' }, 'block').deltaPoints > 0);
  assert.ok(impact(noGate, { id: 'BODY_SLAM' }, 'block').deltaPoints > 0);
  const wallOnly = [{ id: 'BARRICADE' }, { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...neutral(7)];
  const conversionOnly = [{ id: 'BODY_SLAM' }, { id: 'JUGGERNAUT' }, { id: 'IMPERVIOUS' }, ...neutral(7)];
  const complete = [
    { id: 'BARRICADE' }, { id: 'BODY_SLAM' }, { id: 'JUGGERNAUT' },
    { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...neutral(5)
  ];
  assert.ok(score(complete, 'block') > score(wallOnly, 'block'));
  assert.ok(score(complete, 'block') > score(conversionOnly, 'block'));
  assert.equal(state(conversionOnly, 'block').started, false);
  assert.equal(state(conversionOnly, 'block').mature, false);
});

test('候选用 raw 差取整，首个正向结构组件有下限但重复和净负不保底', () => {
  const first = impact(neutral(60), { id: 'FIEND_FIRE' }, 'exhaust');
  assert.ok(first.deltaPoints >= 1);
  let repeatedDeck = [{ id: 'TWIN_STRIKE' }, ...neutral(10)];
  let repeated = impact(repeatedDeck, { id: 'TWIN_STRIKE' }, 'auto_strike');
  for (let count = 0; count < 20 && repeated.deltaPoints > 0; count += 1) {
    repeatedDeck = [{ id: 'TWIN_STRIKE' }, ...repeatedDeck];
    repeated = impact(repeatedDeck, { id: 'TWIN_STRIKE' }, 'auto_strike');
  }
  assert.ok(repeated.deltaPoints <= 0);
  assert.ok(impact(
    [{ id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }, ...neutral(10)],
    { id: 'ANGER' },
    'auto_strike'
  ).deltaPoints < 0);
});

test('候选输出四条 impacts 与四条 scores，非铁甲不装饰', () => {
  const deck = [{ id: 'HELLRAISER' }, { id: 'INFLAME' }, ...filler(18)];
  const candidates = [{ id: 'TWIN_STRIKE', name: '双重打击' }];
  const decorated = decorateIroncladArchetypes('ironclad', deck, [], candidates);
  assert.equal(decorated[0].archetypeImpacts.length, 4);
  assert.equal(decorated[0].archetypeScores.length, 4);
  assert.equal(decorated[0].archetypeImpact.id, 'auto_strike');
  assert.ok(decorated[0].archetypeImpacts.every(item => Number.isInteger(item.deltaPoints)));
  assert.ok(decorated[0].archetypeImpacts.find(item => item.id === 'auto_strike').deltaPoints > 0);
  assert.ok(decorated[0].archetypeImpacts.find(item => item.id === 'strength').deltaPoints > 0);
  assert.equal(decorateIroncladArchetypes('silent', deck, [], candidates), candidates);
  assert.equal(isIronclad('铁甲战士'), true);
  assert.equal(isIronclad('silent'), false);
});

test('候选输出前后阶段并只报告新补齐的直接结构轴', () => {
  const base = [{ id: 'POMMEL_STRIKE' }, { id: 'PILLAGE' }, ...neutral(8)];
  const gate = impact(base, { id: 'HELLRAISER' }, 'auto_strike');
  assert.equal(gate.beforeStage, 'unformed');
  assert.equal(gate.afterStage, 'started');
  assert.deepEqual(gate.completedAxes, ['auto_gate']);
  assert.equal(gate.beforeScore < gate.afterScore, true);

  const support = impact(focusedDecks.strength, { id: 'BATTLE_TRANCE' }, 'strength');
  assert.equal(support.beforeStage, 'formed');
  assert.equal(support.afterStage, 'formed');
  assert.deepEqual(support.completedAxes, []);
});

test('叠卡轴放慢而单卡槽仍由第一张完成', () => {
  const starter = [
    ...Array.from({ length: 5 }, () => ({ id: 'STRIKE_IRONCLAD' })),
    ...filler(4),
    { id: 'BASH' }
  ];
  const firstPommel = impact(starter, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const secondPommel = impact([...starter, { id: 'POMMEL_STRIKE' }], { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const firstHellraiser = impact(starter, { id: 'HELLRAISER' }, 'auto_strike').deltaPoints;
  const secondHellraiser = impact([...starter, { id: 'HELLRAISER' }], { id: 'HELLRAISER' }, 'auto_strike').deltaPoints;
  const pommelAfterGate = impact([...starter, { id: 'HELLRAISER' }], { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const pillageAfterLoop = impact(
    [...starter, { id: 'HELLRAISER' }, { id: 'POMMEL_STRIKE' }],
    { id: 'PILLAGE' },
    'auto_strike'
  ).deltaPoints;
  assert.ok(firstPommel > 0, `pommel ${firstPommel}`);
  assert.ok(secondPommel > 0 && secondPommel >= firstPommel * 0.45, `second pommel ${secondPommel}`);
  assert.ok(firstHellraiser > firstPommel, `hellraiser ${firstHellraiser}`);
  assert.ok(secondHellraiser <= firstHellraiser * 0.4, `second hellraiser ${secondHellraiser}`);
  assert.ok(pommelAfterGate > 0 && pommelAfterGate < firstPommel, `pommel after activation ${pommelAfterGate}`);
  assert.ok(pillageAfterLoop > 0, `pillage ${pillageAfterLoop}`);

  const stacks = [
    ['BURNING_PACT', 'exhaust', deck => deck],
    ['CONFLAGRATION', 'strength', deck => [{ id: 'INFLAME' }, ...deck]],
    ['IMPERVIOUS', 'block', deck => [{ id: 'BARRICADE' }, ...deck]]
  ];
  for (const [id, archetype, prepare] of stacks) {
    const base = prepare(neutral(10));
    const first = impact(base, { id }, archetype).deltaPoints;
    const second = impact([...base, { id }], { id }, archetype).deltaPoints;
    assert.ok(second > 0 && second < first, `${id} second ${second} first ${first}`);
  }

  for (const [id, archetype] of [
    ['HELLRAISER', 'auto_strike'],
    ['FEEL_NO_PAIN', 'exhaust'],
    ['INFLAME', 'strength'],
    ['BARRICADE', 'block']
  ]) {
    const first = impact(starter, { id }, archetype).deltaPoints;
    const second = impact([...starter, { id }], { id }, archetype).deltaPoints;
    assert.ok(second <= first * 0.4, `${id} second ${second} first ${first}`);
  }
});

test('生成文档版本、数量和 ID 与矩阵一致', () => {
  const filename = path.join(__dirname, '..', '..', 'docs', 'ironclad-four-archetype-matrix.md');
  const document = fs.readFileSync(filename, 'utf8');
  assert.equal(document, generateMatrixMarkdown());
  assert.match(document, /卡牌数：87；矩阵版本：1/);
  const documentedIds = [...document.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]).sort();
  assert.equal(documentedIds.length, 87);
  assert.deepEqual(documentedIds, Object.keys(IRONCLAD_ARCHETYPE_MATRIX).sort());
});
