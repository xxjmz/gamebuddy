## 1. 成型基准与评分模型

- [x] 1.1 新增起始牌组、四套专注成型牌组、缺闸门牌组、混合牌组、87 张全卡杂牌堆和复制全卡堆夹具；验证旧评分下至少“全卡堆不成型”和“专注构筑高于杂牌堆”断言先失败。
- [x] 1.2 将评分拆成蓝图结构分与前 10 张关键组汇合稳定性，并用带潜力底座的乘法合成构筑点；运行 `node --test agent/tests/ironclad-archetypes.test.js` 验证缺闸门组件仍正增长、专注构筑高于杂牌堆。
- [x] 1.3 输出 `unformed/started/formed` 三阶段并保留旧 `started/mature` 兼容字段；验证全卡堆没有任何 `formed`，四套专注夹具均能达到对应成型阶段。

## 2. 候选成型引导与协议

- [x] 2.1 为候选影响增加真实 `beforeScore/afterScore`、`beforeStage/afterStage` 和 `completedAxes`，并验证补齐最后必要轴会产生“启动”或“成型”跃迁，普通外围增益不会误报跃迁。
- [x] 2.2 扩展 `draft_impact` 生成、Harness 校验和 Mod codec 的原子校验，同时保留顶层自动打击别名与旧布尔字段；运行 `node --test agent/tests/auto-strike.test.js`、`node harness/validate-protocol.js` 和 `dotnet run --project mod/GameBuddyBridge.Tests`。
- [x] 2.3 在 Mod 中保存奖励打开时的牌组与候选多重集合，奖励关闭后通过首个稳定快照唯一确认实际拿牌并发布一次 `card.reward.selected`；测试覆盖正常拿牌、升级候选、重复牌、跳过、多候选变化和未知结果。

## 3. 构筑点和阶段 UI

- [x] 3.1 更新桌面端流派总览与候选影响，移除百分号并显示三阶段、真实前后构筑点及阶段跃迁；运行 `node --test agent/tests/archetype-ui.test.js`。
- [x] 3.2 更新游戏内铜铁面板，固定显示四套构筑点与阶段，悬停候选时优先显示“启动/成型”和补齐轴，否则显示前后点数；通过 Mod codec/格式化测试验证文本不含 `%`。
- [x] 3.3 缓存同奖励签名的候选跃迁，收到已确认的 `card.reward.selected` 后只对向上阶段跃迁播放一次铜色反馈并生成一条桌宠确定性短句；测试验证普通加分、预览、跳过、未知选择不反馈，多流派跃迁合并且成型优先。

## 4. 游戏内候选定位

- [ ] 4.1 将候选解析改为“明确悬停 > 焦点 > 最近点击 > 无候选”，移除扩大重叠矩形的主判定；用可测试的纯选择逻辑覆盖相邻卡牌、焦点与锁定优先级。
- [ ] 4.2 观察候选点击但不消费输入，奖励关闭/刷新时清理锁定；构建 Mod 并在实机三卡奖励页验证鼠标悬停、键盘/手柄焦点、点击和正常选牌均不受影响，且最后点击不被错误当作拿牌确认。

## 5. 集成验证

- [ ] 5.1 运行 `npm run test:syntax`、`npm run test:agent`、`npm run harness:validate-all` 及流派度、UI、弹幕相关测试，确认商店、场景弹幕和共享弹幕没有因协议扩展回归。
- [ ] 5.2 运行 `npx openspec validate guide-archetype-formation --strict`，并在真实铁甲奖励页记录构筑点、阶段跃迁、候选定位、拿牌确认、一次性成型反馈和奖励关闭清理的验收结果。
