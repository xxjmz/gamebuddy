'use strict';

const CATALOG = {
  entry: ['围观席就位', '小伙伴，这场我陪你', '新一场，开看', '镜头给到这边', '观战搭子上线'],
  low_hp: ['血条有点抢镜了', '这血线，看得我捏把汗', '小伙伴，我还在', '观众席突然安静', '心跳开始加速'],
  hp_drop: ['血条动了，心也跟着动了', '看得我一激灵', '小伙伴，还陪着你呢', '这一下看见了', '观众席捏了把汗'],
  attack: ['攻击意图亮起来了', '看到了，对面准备出手', '镜头给到对面', '观战席坐直了', '这一回合开始紧张了'],
  card_played: ['这张牌已经打出', '镜头跟上这一手', '场面继续推进', '观战席看到了', '这一回合有新动作'],
  plan: ['辅助建议到了', '这一轮有参考方案了', '小伙伴，建议更新啦', '方案已就位', '陪你看看这套建议'],
  tentative: ['这份建议还带着不确定性', '辅助给的是暂定方案', '小伙伴，方案先作参考', '收到建议，结论还没拍板', '暂定方案到场'],
  ended: ['这场结束了', '观战席歇一会儿', '小伙伴，缓口气', '这一段先落幕', '下一站再见'],
  victory: ['赢下这场了！', '小伙伴，漂亮', '观战席鼓掌', '这一场拿下', '好，看到胜利了'],
  defeat: ['这场结束了，先歇会儿', '小伙伴，陪你缓一下', '观战席还在', '先喘口气', '这局辛苦了'],
  mechanic: ['场面有新变化', '事件有新动静', '观战席坐直了', '这段有动静', '小伙伴，我看着呢'],
  general: ['观战席还在', '镜头继续跟上', '小伙伴，我在看', '这局继续', '前排坐好']
};

const SPECIALTY_PHRASES = [
  { text: '这下有节目了', characterKeys: ['generic'], sceneTags: ['attack', 'attack-intent'], tones: ['tense'], memeFamily: '节目效果', source: 'local_phrase_pack' },
  { text: '前方高能，镜头跟紧', characterKeys: ['generic'], sceneTags: ['attack', 'mechanic'], tones: ['tense', 'curious'], memeFamily: '前方高能', source: 'local_phrase_pack' },
  { text: '场面开始上强度了', characterKeys: ['generic'], sceneTags: ['attack', 'low_hp', 'hp_drop'], tones: ['tense'], memeFamily: '上强度', source: 'local_phrase_pack' },
  { text: '这波观众席不眨眼', characterKeys: ['generic'], sceneTags: ['mechanic', 'attack'], tones: ['curious', 'tense'], memeFamily: '围观', source: 'local_phrase_pack' },
  { text: '铁甲气场拉满', characterKeys: ['ironclad'], sceneTags: ['attack', 'mechanic', 'victory'], tones: ['bold', 'tense', 'hype'], memeFamily: '铁甲', source: 'local_phrase_pack' },
  { text: '稳住镜头，硬派登场', characterKeys: ['ironclad'], sceneTags: ['low_hp', 'hp_drop'], tones: ['tense'], memeFamily: '硬派', source: 'local_phrase_pack' },
  { text: '这身法，有点东西', characterKeys: ['silent'], sceneTags: ['attack', 'mechanic'], tones: ['tense', 'curious'], memeFamily: '身法', source: 'local_phrase_pack' },
  { text: '机械感拉满，继续看', characterKeys: ['defect'], sceneTags: ['mechanic', 'attack'], tones: ['curious', 'tense'], memeFamily: '机械', source: 'local_phrase_pack' },
  { text: '这气场，镜头先别切', characterKeys: ['watcher'], sceneTags: ['attack', 'mechanic'], tones: ['calm', 'bold'], memeFamily: '气场', source: 'local_phrase_pack' }
];

function specialtyCandidates(context) {
  const tags = new Set(context?.sceneTags || []);
  const characterKey = context?.characterKey || 'generic';
  const tone = context?.tone || 'warm';
  return SPECIALTY_PHRASES.filter(item => (
    (item.characterKeys.includes(characterKey) || item.characterKeys.includes('generic'))
    && item.tones.includes(tone)
    && item.sceneTags.some(tag => tags.has(tag))
  ));
}

module.exports = { CATALOG, SPECIALTY_PHRASES, specialtyCandidates };
