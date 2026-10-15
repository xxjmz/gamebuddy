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
const score = (deck, id, relics = []) => scoreIroncladArchetypes(deck, relics)
  .find(item => item.id === id).score;
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

test('升级有效张数更高、重复边际递减且厚牌降低 setup', () => {
  const base = [{ id: 'HELLRAISER' }, ...filler(18)];
  const normal = impact(base, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const upgraded = impact(base, { id: 'POMMEL_STRIKE', upgraded: true }, 'auto_strike').deltaPoints;
  const once = [...base, { id: 'POMMEL_STRIKE' }];
  const twice = [...once, { id: 'POMMEL_STRIKE' }];
  const first = normal;
  const second = impact(once, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  const third = impact(twice, { id: 'POMMEL_STRIKE' }, 'auto_strike').deltaPoints;
  assert.ok(upgraded > normal);
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

test('消耗引擎遵守零闸门、单闸门上限与双闸门协同', () => {
  const noGate = [{ id: 'BURNING_PACT' }, { id: 'TRUE_GRIT' }, { id: 'FIEND_FIRE' }, ...filler(17)];
  const oneGate = [{ id: 'FEEL_NO_PAIN' }, ...noGate];
  const twoGates = [{ id: 'DARK_EMBRACE' }, ...oneGate, { id: 'STOKE' }];
  assert.ok(score(noGate, 'exhaust') <= 20);
  assert.ok(score(oneGate, 'exhaust') <= 65);
  assert.ok(score(twoGates, 'exhaust') > score(oneGate, 'exhaust'));
  assert.notEqual(impact(twoGates, { id: 'CORRUPTION' }, 'exhaust').role, 'hardPoison');
});

test('力量流无来源受限，力量来源加多段显著成型并递减', () => {
  const noSource = [{ id: 'TWIN_STRIKE' }, { id: 'WHIRLWIND' }, { id: 'CONFLAGRATION' }, ...filler(17)];
  const active = [{ id: 'INFLAME' }, ...noSource];
  assert.ok(score(noSource, 'strength') <= 20);
  assert.ok(score(active, 'strength') > score(noSource, 'strength') + 20);
  const first = impact([{ id: 'INFLAME' }, ...filler(18)], { id: 'CONFLAGRATION' }, 'strength').deltaPoints;
  const second = impact([{ id: 'INFLAME' }, { id: 'CONFLAGRATION' }, ...filler(18)], { id: 'CONFLAGRATION' }, 'strength').deltaPoints;
  assert.ok(first > second && second > 0);
});

test('格挡流分别限制无闸门和无转化，完整三轴最高', () => {
  const wallOnly = [{ id: 'BARRICADE' }, { id: 'UNMOVABLE' }, { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...filler(16)];
  const conversionOnly = [{ id: 'BODY_SLAM' }, { id: 'JUGGERNAUT' }, { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...filler(16)];
  const complete = [{ id: 'BARRICADE' }, { id: 'BODY_SLAM' }, { id: 'JUGGERNAUT' }, { id: 'IMPERVIOUS' }, { id: 'BLOOD_WALL' }, ...filler(15)];
  assert.ok(score(wallOnly, 'block') <= 55);
  assert.ok(score(conversionOnly, 'block') <= 45);
  assert.ok(score(complete, 'block') > score(wallOnly, 'block'));
  assert.ok(score(complete, 'block') > score(conversionOnly, 'block'));
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

test('生成文档版本、数量和 ID 与矩阵一致', () => {
  const filename = path.join(__dirname, '..', '..', 'docs', 'ironclad-four-archetype-matrix.md');
  const document = fs.readFileSync(filename, 'utf8');
  assert.equal(document, generateMatrixMarkdown());
  assert.match(document, /卡牌数：87；矩阵版本：1/);
  const documentedIds = [...document.matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]).sort();
  assert.equal(documentedIds.length, 87);
  assert.deepEqual(documentedIds, Object.keys(IRONCLAD_ARCHETYPE_MATRIX).sort());
});
