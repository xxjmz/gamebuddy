'use strict';

// 技能表达只负责“怎么说”，不负责判断技能事实。
// 主弹幕只显示角色台词，不拼接技能类别、技能名、修饰词或冒号。
const ACTION_POOLS = {
  attack: {
    modifiers: ['恶狠狠的', '试探性的', '突然袭击式的', '敷衍但很痛的', '不讲道理的', '贴脸式的', '礼貌但致命的', '轻描淡写的', '十分有想法的', '带着私人恩怨的', '看似普通的', '毫无预告的', '直奔面门的', '极其敷衍的', '假装没用力的'],
    lines: ['没什么，我只是要狠狠地给你来一下。', '这一口不贵，收你一点血。', '轻轻碰一下，真的，只是轻轻。', '别紧张，我就确认一下你还活着。', '这一拳没有私人恩怨，主要是你站在这里。']
  },
  heavy_attack: {
    modifiers: ['蓄谋已久的', '压轴登场的', '地动山摇的', '一锤定音的', '遗言提醒式的', '债务清算式的', '全款支付式的', '压迫感拉满的', '不留余地的', '专程赶来的', '大力出奇迹的', '先声夺人的'],
    lines: ['这一击落下，建议先想好遗言。', '这一回合只负责把场面砸出声音。', '别问有多重，问就是全力以赴。', '这一击之后，刚才的血量就不算数了。']
  },
  multi_hit: {
    modifiers: ['连本带利的', '雨露均沾的', '多次确认的', '持续输出的', '反复横跳的', '追着不放的', '连环追问式的', '一顿操作的', '不止一下的', '逐帧结算的', '密集轰炸的', '重复确认的'],
    lines: ['一下不够，那就多来几下。', '别急，后面还有，今天主打一个连续。', '这一套讲究的就是不让你喘气。', '每一下都不重，加起来就不好说了。']
  },
  defend: {
    modifiers: ['突然稳健的', '缩进壳里的', '拒绝沟通的', '门窗紧闭的', '防御性极强的', '先保命再说的', '战略性躺平的', '把自己包好的', '临时抱盾的', '今天不想挨打的'],
    lines: ['先挡一下，想打我没那么容易。', '今天先不还手，主要是测试防御。', '别催，我先把门关上。', '这一回合谁都别想轻松。']
  },
  scaling: {
    modifiers: ['苦大仇深的', '含泪变强的', '蓄谋已久的', '忍辱负重的', '沉淀多年的', '越想越气的', '准备翻盘的', '稳步膨胀的', '闭关修炼的', '被迫成长的', '梦想成真的', '一雪前耻的', '莫欺少年穷式的', '厚积薄发的', '突然开窍的'],
    lines: ['沉淀！！莫欺少年穷！！', '今天先发育，明天让你后悔。', '别急，我马上就不是现在这个数值了。', '力量这种东西，当然是越攒越有味道。', '现在笑得越开心，等会儿哭得越整齐。']
  },
  buff: {
    modifiers: ['仪式感拉满的', '自我鼓励式的', '状态起飞的', '气势汹汹的', '认真准备的', '热身完毕的', '全员开会式的', '突然上进的', '精神焕发的', '蓄势待发的'],
    lines: ['先把状态调好，等会儿再谈输赢。', '这不是浪费回合，这是投资未来。', '我先准备一下，马上给你展示完全体。', '状态已经到位，接下来轮到场面紧张了。']
  },
  debuff: {
    modifiers: ['阴魂不散的', '精准针对的', '贴脸提醒的', '状态管理式的', '不怀好意的', '温柔但恶毒的', '专门添堵的', '精准降维的', '带着恶意的', '慢慢折磨的'],
    lines: ['你先变弱一点，我们再好好聊。', '给你加一点小小的生活难度。', '状态不好不要紧，接下来会更不好。', '这不是针对谁，我只是刚好看中了你。']
  },
  status_cards: {
    modifiers: ['牌堆装修式的', '污染环境式的', '添堵不嫌多的', '无偿赠送的', '循环破坏式的', '抽牌破坏式的', '恶作剧式的', '精准添乱的', '混入日常的', '牌库投毒式的'],
    lines: ['给你的牌堆加点小惊喜。', '这张牌先替我保管一下，别急着找它。', '抽到什么不重要，重要的是你会抽到它。', '牌堆已经开始有自己的想法了。']
  },
  summons: {
    modifiers: ['拖家带口的', '摇人式的', '家族企业式的', '成群结队的', '人多势众的', '呼朋唤友的', '现场组队的', '批量生产的', '一键复制的', '亲友团登场的'],
    lines: ['一个人打不过，那就全家一起上。', '别急，马上给你安排更多观众。', '我这边人手不够？不存在的。', '来都来了，再叫几个朋友。']
  },
  artifact: {
    modifiers: ['套盾式的', '防护拉满的', '拒绝减益的', '保护费到账的', '铜墙铁壁的', '不吃控制的', '先穿护甲的', '免疫边缘试探的'],
    lines: ['先把这层保护拆了，再谈别的。', '想影响我？先问问这层保护答不答应。', '今天的减益名额已经满了。', '这层壳还在，谁都别想随便动我。']
  },
  thorns: {
    modifiers: ['带刺的', '摸不得的', '反向教育的', '碰瓷式的', '以牙还牙的', '触碰警告式的', '防御反击的', '谁碰谁知道的'],
    lines: ['摸我之前最好先想清楚。', '你打我一下，我还你一点。', '这身刺不是装饰，真的会疼。', '攻击之前先看看自己还剩多少血。']
  },
  healing: {
    modifiers: ['强行续命的', '医学奇迹式的', '死而复生式的', '吃饱再打的', '自我修复的', '越挨打越会活的', '拒绝退场的', '生命力顽强的', '血条回春的', '再给一次机会的'],
    lines: ['别急，我还能再撑一会儿。', '刚才那点伤，先当没发生过。', '想让我退场？还得再排个号。', '血条这种东西，当然可以重新谈。']
  },
  phase: {
    modifiers: ['剧情转折式的', '第二形态式的', '突然认真起来的', '阶段结算式的', '压轴变身式的', '画风突变式的', '重新开局式的', '强行续集式的'],
    lines: ['刚才只是热身，现在才进入正片。', '恭喜，战斗难度已经更新。', '上一阶段的经验，下一阶段不一定适用。', '别急着庆祝，故事还没有结束。']
  },
  special: {
    modifiers: ['无法归类的', '突然整活的', '说明书缺页的', '机制检测中的', '不按套路来的', '疑似隐藏剧情的', '让人摸不着头脑的', '规则之外的'],
    lines: ['这招暂时没有解释，先记下来。', '我也不知道怎么说，但它看起来不太妙。', '机制正在加载，请保持警惕。', '这一下不像普通动作，先别急着下结论。']
  }
};

const CATEGORY_LABELS = {
  attack: '攻击', heavy_attack: '重击', multi_hit: '多段攻击', defend: '防御',
  scaling: '力量成长', buff: '强化', debuff: '减益', status_cards: '状态牌污染',
  summons: '召唤', artifact: '人工制品', thorns: '反伤', healing: '治疗',
  phase: '阶段转换', special: '特殊行动'
};

function hashSeed(...values) {
  let hash = 2166136261;
  for (const value of values) {
    for (const char of String(value ?? '')) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function pick(list, seed) {
  return list[hashSeed(seed) % list.length];
}

function classifyMove(move = {}, enemy = {}) {
  const text = JSON.stringify(move).toLowerCase();
  const intent = String(move.intent || enemy.intent || '').toLowerCase();
  const powers = Array.isArray(move.powers) ? move.powers : [];
  if (/phase|transform|revive|阶段|变身/.test(text)) return 'phase';
  if (/summon|召唤/.test(text) || /summon/.test(intent)) return 'summons';
  if (Number(move.heal) > 0 || /heal|regen|治疗|再生|回复/.test(text)) return 'healing';
  if (/artifact|人工制品/.test(text)) return 'artifact';
  if (/thorns|荆棘|反伤/.test(text)) return 'thorns';
  if (/status|wound|burn|slime|状态|伤口|灼伤|黏液/.test(text) || /status/.test(intent)) return 'status_cards';
  if (/strength|力量|成长|enrage|怒气/.test(text)) return 'scaling';
  if (/debuff|weak|vulnerable|frail|虚弱|易伤|脆弱|减益/.test(text) || /debuff/.test(intent)) return 'debuff';
  if (/buff|强化|增益|ritual/.test(text) || /buff/.test(intent)) return 'buff';
  const damage = Number(move?.damage?.normal ?? move.damage);
  const hits = Number(move?.damage?.hit_count ?? move.hit_count) || 1;
  if (hits > 1) return 'multi_hit';
  if (Number(move.block) > 0 && !Number.isFinite(damage)) return 'defend';
  if (Number.isFinite(damage) && damage >= 15) return 'heavy_attack';
  if (/defend|block|guard|防御|格挡/.test(intent)) return 'defend';
  if (Number.isFinite(damage) || /attack|strike|hit|damage|攻击/.test(intent)) return 'attack';
  if (powers.length) return 'special';
  return 'special';
}

function actionDialogue({ moveName, move, enemy, sceneId, occurrence = 0 } = {}) {
  const category = classifyMove(move || {}, enemy || {});
  const pool = ACTION_POOLS[category] || ACTION_POOLS.special;
  const seed = hashSeed(sceneId, enemy?.id || enemy?.name, move?.id || moveName, occurrence, category);
  const line = pick(pool.lines, seed + 1);
  return {
    category,
    categoryLabel: CATEGORY_LABELS[category] || '特殊行动',
    line,
    text: line
  };
}

const ACTION_MODIFIER_COUNT = Object.values(ACTION_POOLS).reduce((sum, pool) => sum + pool.modifiers.length, 0);

module.exports = { ACTION_POOLS, ACTION_MODIFIER_COUNT, CATEGORY_LABELS, classifyMove, actionDialogue, hashSeed };
