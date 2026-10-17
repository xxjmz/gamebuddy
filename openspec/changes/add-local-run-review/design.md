## Context

见 `proposal.md`。当前 Bridge 连续发送 `gamebuddy.state.v1` 状态和战斗/奖励/火堆等局部事件，但没有稳定 `runId`、明确整局结束事件或长期汇总。Electron 已在主进程使用 `app.getPath('userData')` 保存桌宠偏好；已有 `recordDecision` 写入工作目录 `runs/`，不适合面向玩家的安装版历史。四流派评分仅覆盖铁甲，不能作为全角色通用画像。

参考图的核心结构是“左侧角色身份 + 右上五星图 + 右下近期统计”，不是要复制其中的第三方角色、Logo 或具体指标。复盘页需要保留该信息结构和明亮街机视觉，同时使用 GameBuddy 自有资产和《杀戮尖塔 2》数据。

## Goals / Non-Goals

**Goals:**

- 用最少且可验证的数据完成跨角色的本地玩法画像。
- 每一项百分比都能回溯到原始计数，未知数据不冒充零。
- 把铁甲流派成长接入最近一局复盘，但不让其他角色获得伪造流派标签。
- 即使断线、重连或应用崩溃，也不重复或损坏历史。
- 页面在 1120×720 最小窗口仍保持参考图的左右主结构。

**Non-Goals:**

- 不评价逐回合出牌是否最优，不建立敌人基准数据库。
- 不比较社区排名，不把倾向值解释成能力值。
- 不引入 SQLite、云账号、遥测或新的网络依赖。
- 不从游戏安装目录自动提取或重新分发角色美术。

## Decisions

### 1. 先补可靠对局事实，不用楼层回退猜结局

Bridge 为状态的 `run` 增加可选字段：

```text
runId, seed?, ascension?, startedAt?, playtimeSeconds?, result?
```

并新增事件：

```text
run.started { runId, character, ascension?, seed?, startedAt? }
run.ended   { runId, result, act, floor, playtimeSeconds? }
```

正常胜负由游戏运行时事实发布；同一 `runId + result` 只发布一次。关闭游戏时无法证明玩家主动放弃，因此不立即写 `abandoned`；下次出现不同 `runId` 时，主进程才把旧活动草稿归档为放弃。曾考虑用“楼层变小”推断新局，但每日挑战、重连和菜单快照都会造成误判，因此放弃。

为复盘补充或强化以下事实：

- `combat.started/ended`：`roomType`、敌人列表、胜负、回合数、开始/结束生命。
- `card.played`：卡牌 ID、类型；只统计类型已知的打出。
- `card.reward.closed/selected`：明确拿取或跳过，未知结果单列。
- `rest.closed`：`HEAL`、`SMITH` 或 `UNKNOWN`。
- `shop.opened/closed`：进入次数、前后金币；只有能排除事件失金时才计 `goldSpent`。
- `room.entered`：节点 ID 与 `Monster/Elite/Boss/Shop/RestSite/Unknown` 类型。

### 2. 主进程维护一个版本化 JSON 仓库

文件位于：

```text
app.getPath('userData')/review-history.v1.json
```

结构如下：

```json
{
  "schema": "gamebuddy.review-history.v1",
  "updatedAt": 0,
  "activeRun": {
    "runId": "…",
    "startedAt": 0,
    "lastSeenAt": 0,
    "checkpoint": {}
  },
  "runs": []
}
```

每条完成记录保存：

```text
identity:
  runId, character, ascension?, seedHash?, startedAt, endedAt, result
progress:
  finalAct, finalFloor, playtimeSeconds?, progressPercent
finalState:
  hp, maxHp, gold, deck[], relics[], potions[], deckSize
counters:
  combats, normalCombats, eliteEntries, eliteWins, bossEntries,
  typedCardsPlayed, attacksPlayed,
  cardRewards, cardsTaken, rewardSkips, unknownRewards,
  shopsVisited, knownGoldSpent, unknownShopClosures,
  restSites, smiths, heals, unknownRestActions,
  roomsByType
archetypes?:
  finalScores, peakScores, firstStartedFloor
```

只保存种子的 SHA-256 短哈希，不保存共享弹幕、LLM 输入输出、客户端 ID、API Key 或完整决策日志。每个有效事件或楼层变化后节流写活动草稿，最长 5 秒落盘一次；结束事件立即归档。写入采用同目录临时文件、`fsync` 后 rename，启动时若主文件损坏则尝试 `.bak`，仍失败就保留坏文件并显示恢复提示，不静默清空。

JSON 足以承载 100 局，易导出且不增加原生依赖。曾考虑 SQLite，但当前数据规模、查询复杂度和 Electron 打包成本都不值得。

### 3. 五星图统一表示“越高越常这样玩”

所有轴按当前选择角色最近最多 50 局聚合，至少 3 局才绘制。聚合使用总分子/总分母，避免一局只有一次操作却与长局同权。每轴保留 `{ value, numerator, denominator, unknown }`。

#### 进攻出牌

```text
attackPlay = 100 × attacksPlayed / typedCardsPlayed
```

只统计类型已知的实际打出牌。它表示出牌结构偏进攻，不表示攻击牌打得正确。

#### 拿牌克制

```text
skipRate = rewardSkips / (rewardSkips + cardsTaken)
netGrowth = max(0, finalDeckSize - observedStartDeckSize)
compactness = clamp(1 - netGrowth / 25, 0, 1)
cardRestraint = 100 × (0.6 × skipRate + 0.4 × compactness)
```

奖励结果未知时不进入分母。选择 60/40 是因为“明确跳过”比起始卡组差异更能表达主动克制；最终页面同时显示平均牌组张数，防止单分数掩盖事实。

#### 精英挑战

```text
eliteShare = eliteEntries / (eliteEntries + normalCombats)
eliteChallenge = 100 × clamp(eliteShare / 0.30, 0, 1)
```

30% 战斗房为显示上限，只用于把常见区间铺满雷达，不表示最优路线。Boss 不进入分母。

#### 商店消费

```text
visitPart = clamp(shopsVisited / actsReached, 0, 1)
spendPart = knownGoldSpent / (knownGoldSpent + finalGold)
shopSpending = 100 × (0.5 × visitPart + 0.5 × spendPart)
```

没有可靠消费或结束金币时该部分未知；只知道其中一部分时，按已知部分归一，不把未知补零。

#### 火堆升级

```text
campUpgrade = 100 × smiths / (smiths + heals + otherKnownRestActions)
```

未知火堆行为不进分母。它表示更常升级还是回血，不表示升级一定正确。

轴值保留一位小数，绘图显示整数。详情抽屉展示公式、分子、分母、未知数和一句中性解释。

### 4. 近期统计条使用结果指标，不与倾向轴混为一谈

页面右下固定显示当前角色最近最多 50 局：

- 胜率：`win / (win + loss)`；放弃单列，不进胜率分母。
- 平均到达进度：每局按章节起点与本章已走楼层映射到 0–99，胜利固定 100。
- 20 张以内牌组率：最终牌组不超过 20 张的有效局数占比。
- 精英挑战率：有至少一次精英挑战的局数占比。
- 火堆升级率：同五星轴的原始 `smith / knownRestActions`。

每条同时显示百分比和 `分子/分母`；平均值显示“均值 · N局”。没有数据时显示“暂无”，不画 0% 蓝条。

### 5. 主角色和副角色按使用频率确定

统计窗口是全角色最近 50 局：

- 主角色：局数最多者；并列时最近使用者优先。
- 副角色：其余角色按局数和最近时间排序，全部可点击。
- 左上蓝色胶囊显示全窗口 `胜局 / 有结果局数`，旁边显示放弃数。
- 点击副角色只切换角色大图、五星图、统计条和角色总结；全窗口战绩保持不变。

角色素材使用可替换 provider：

1. `src/assets/review/characters/<character>.webp` 中由项目合法提供的专用图；
2. 对应 `src/assets/pets/<character>/advising.png`；
3. 带角色名和色块的占位。

第一版不自动读取游戏安装目录。这样 UI 可先完整落地，后续替换授权大图不影响数据和布局。

### 6. UI 复刻参考图结构，作为独立全幅复盘页

侧栏新增 `05 我的复盘`。进入后保留 Electron 顶部标题栏用于拖动和关闭，隐藏常规深色侧栏、页面标题和 LLM 日志，内容区变为全幅 `review-mode`：

- 背景：暖黄色底，叠加低对比度 GameBuddy 方脸重复纹样和浅色速度线。
- 左上：圆角蓝色大胶囊，黄色大号胜局数字、白色总局数。
- 左列约 48%：`主角色` 横条、4:5 大图框；底部 `副角色` 横条和方形缩略图。
- 右列约 52%：上半区五边形蓝色网格、蓝色外轮廓、青色半透明数据面；五个中文轴名环绕顶点。
- 右下：`最近的50场对局` 横条、五条蓝底/青色填充统计条、右侧蓝色滚动条；继续向下滚动是最近一局和历史列表。
- 字体：使用现有系统中文字体；数字加粗，棕橙色标签，蓝/青仅用于数据图形。
- 动效：切换角色时数据面 180ms 过渡；尊重 `prefers-reduced-motion`，不做粒子或闪烁。

在 1120×720 使用左右 46/54 布局；宽度低于 900 时上下堆叠，但不改变信息顺序。视觉上不复用当前主工作台的深色面板，避免参考图风格被稀释。

五星图使用原生 SVG，不引入图表库：五个同心多边形、五条轴线和一个数据多边形即可满足需求，便于测试坐标、无数据轴和辅助文本。

### 7. 内容生成只使用确定性模板

角色总结按以下顺序生成 1–3 句：

1. 样本句：`最近 N 局中，你有 X 局使用铁甲战士。`
2. 倾向句：有效轴最高值比有效轴中位数至少高 12 点时，描述最高轴；否则写“近期风格较均衡”。
3. 复盘句：比较最近 10 局与前 10 局的平均进度，只描述“上升/接近/下降”，不归因。

铁甲最近一局额外复用流派评分，记录最终分、峰值和首次跨 60 的楼层，示例：

```text
消耗流在第 18 层启动，最终 73 点；格挡流最高 59 点，尚未闭合。
```

其他角色省略流派句。规则不调用 LLM，保证离线、可复现和可测试。

### 8. Renderer 只读，文件能力留在主进程

主进程负责仓库、聚合、导出和清空；preload 只暴露窄 IPC：

```text
review:getDashboard
review:export
review:clear
review:changed
```

Renderer 不接收任意文件路径，不直接访问 Node `fs`。导出通过系统保存对话框；清空必须由 renderer 二次确认后携带一次性确认 token 调用，避免误触。

## Risks / Trade-offs

- **[风险] 五星轴看起来像能力评级** → 标题固定写“玩法倾向”，轴详情和页脚明确“高低不代表优劣”。
- **[风险] 角色本身卡牌结构影响进攻出牌比例** → 雷达只在同一角色内聚合，不跨角色比较高低。
- **[风险] 商店金币差分混入事件失金** → 只有完整 shop open/close 区间且来源可确认时计消费，其余记 unknown。
- **[风险] 崩溃时拿不到 run.ended** → 活动草稿持续 checkpoint；新 `runId` 到来时归档旧局为 abandoned。
- **[风险] 放弃会拉低视觉战绩** → 胜率只用 win/loss，abandoned 独立显示。
- **[风险] 角色大图缺失影响参考图还原** → 预留固定画框和三层素材回退；专用授权图可后换，不阻塞功能。
- **[风险] 100 局完整牌表增大文件** → 只保留最终牌表和计数，不保存逐帧状态；预计文件保持在数 MB 内。
- **[风险] 协议升级影响旧 Mod** → 新字段保持可选，主进程没有 `runId` 时不写正式历史并显示“需要新版 Bridge”。

## Migration Plan

1. 先扩展协议和 Replay fixtures，旧状态继续通过验证。
2. 增加本地仓库并只记录活动草稿，在隐藏开发入口核对重复/恢复。
3. 开启完成记录和聚合器，用固定 fixtures 校验五轴分子分母。
4. 接入复盘页和角色切换，完成 1120×720、宽屏及窄屏截图验收。
5. 最后开放导出/清空并在真实胜利、死亡、重连和新局替代场景验收。
6. 回滚时隐藏复盘入口并停止写入；保留 JSON 文件，后续恢复不会丢历史。
