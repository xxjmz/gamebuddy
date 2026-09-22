'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// 弹幕只能表达观战氛围。自动排除会形成出牌/数值策略、操控或明显不适合展示的内容。
const BLOCKED = /https?:|www\.|@|加群|私信|代练|淘宝|vx|微信|QQ群|抽奖|外挂|脚本|开挂|傻[逼B]|妈[的的]|废物|垃圾|主播|up主/i;
const STRATEGY = /出牌|打出|卡牌|这张|格挡|伤害|流派|构筑|牌组|卡组|费用|能量|回合|遗物|毒|强度|数值|机制|攻略|打法|过牌|抽牌|循环|必胜|稳赢|应该|必须|建议.*[打选拿]/i;
const RULES = [
  ['entry', /来了|开局|开打|开场|开始|登场|前排|坐好/],
  ['attack', /攻击|出手|打脸|危险|动手|挨打|痛/],
  ['low_hp', /残血|低血量|血条|要死|危险|寄/],
  ['victory', /赢|胜利|拿下|赢了|好耶|爽/],
  ['defeat', /输|寄了|没了|倒了|重开/],
  ['mechanic', /变身|复活|召唤|阶段|机制|强化/]
];
const MEME_RULES = [
  ['front-row', /前排|坐好|围观/],
  ['high-energy', /高能|上强度|有节目|有点东西/],
  ['cheer', /好耶|好好好|加油|拿下|爽/],
  ['tension', /危险|寄|稳住|血条|残血/],
  ['shock', /离谱|逆天|绷不住|真的假的/]
];

function args(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    output[argv[index].slice(2)] = argv[index + 1] || true;
    index += 1;
  }
  return output;
}

function normalized(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[！!]{2,}/g, '！')
    .trim();
}

function classify(text) {
  const triggers = RULES.filter(([, matcher]) => matcher.test(text)).map(([trigger]) => trigger);
  return triggers.length ? triggers : ['general'];
}

function toneFor(triggers) {
  if (triggers.includes('victory')) return 'excited';
  if (triggers.some(trigger => ['attack', 'low_hp', 'defeat'].includes(trigger))) return 'tense';
  return 'warm';
}

function memeCategory(text) {
  return MEME_RULES.find(([, matcher]) => matcher.test(text))?.[0] || 'general';
}

function safeRecord(text) {
  if (!text) return { safe: false, reason: 'empty' };
  if (text.length > 36) return { safe: false, reason: 'too_long' };
  if (BLOCKED.test(text)) return { safe: false, reason: 'blocked' };
  if (STRATEGY.test(text)) return { safe: false, reason: 'strategy' };
  return { safe: true };
}

function stableId(row, text) {
  return `bilibili-${crypto.createHash('sha1').update([
    row.bvid || '',
    Number(row.atSeconds || 0).toFixed(3),
    text
  ].join('|')).digest('hex').slice(0, 20)}`;
}

function main() {
  const options = args(process.argv.slice(2));
  const input = options.input || path.join('..', 'data', 'bilibili-sts2-danmaku', 'danmaku.jsonl');
  const output = options.output || path.join('.runtime', 'danmaku-corpus.jsonl');
  const rows = fs.readFileSync(input, 'utf8').split(/\r?\n/);
  const seen = new Set();
  const candidates = [];
  const rejected = {};
  let malformed = 0;
  for (const line of rows) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { malformed += 1; continue; }
    const text = normalized(row.text);
    const verdict = safeRecord(text);
    if (!verdict.safe) {
      rejected[verdict.reason] = (rejected[verdict.reason] || 0) + 1;
      continue;
    }
    const dedupeKey = text.toLocaleLowerCase('zh-CN');
    if (seen.has(dedupeKey)) {
      rejected.duplicate = (rejected.duplicate || 0) + 1;
      continue;
    }
    const triggers = classify(text);
    seen.add(dedupeKey);
    candidates.push({
      id: stableId(row, text),
      text,
      safe: true,
      scene: 'combat',
      triggers,
      tone: toneFor(triggers),
      memeCategory: memeCategory(text),
      source: 'bilibili',
      bvid: row.bvid || null,
      atSeconds: Number.isFinite(Number(row.atSeconds)) ? Number(row.atSeconds) : null
    });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${candidates.map(item => JSON.stringify(item)).join('\n')}\n`);
  console.log(JSON.stringify({
    input,
    output,
    rawRows: rows.filter(Boolean).length,
    malformed,
    prepared: candidates.length,
    rejected
  }, null, 2));
}

module.exports = { normalized, classify, toneFor, memeCategory, safeRecord, stableId };

if (require.main === module) main();
