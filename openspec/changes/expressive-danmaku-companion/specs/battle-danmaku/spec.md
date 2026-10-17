## Purpose

使杀戮尖塔观战弹幕在保留事实技能介绍的同时，通过合理发言时机、不同角色观察角度及真实本局记忆提供连续陪伴感。所有回忆和精彩时刻只来自已采集证据，缺失事实不被补写成游戏结果。

## ADDED Requirements

### Requirement: Spaced and relevant presentation
系统 SHALL 保留每 15 秒请求两句与 60 秒超时，AI 实际显示至少间隔 6 秒；就绪的建议、技能与精彩时刻 SHALL 优先于普通闲聊。延后的 AI 不得阻塞就绪技能。无新变化时普通评论 SHALL 至多每 30 秒显示一句；怪物已消失的当前目标评论 SHALL 丢弃。

#### Scenario: Skill arrives between two comments
- **WHEN** 第一条 AI 已显示，第二条待显示，此时出现技能或建议
- **THEN** 技能/建议可先显示，第二条仍须满足距上一条 AI 至少 6 秒

#### Scenario: Target dies before delayed comment
- **WHEN** 评论绑定的怪物已消失或死亡
- **THEN** 该当前目标评论不上屏，基于有效已发生精彩事件的历史评论不受该目标存活要求影响

### Requirement: Evidence based highlights
系统 SHALL 根据明确事实识别残血跨回合存活、连出牌后敌人残血、重复强化意图、长战敌人倒下及新牌首次打出，并优先用于下一批评论和显示。普通快照重复 SHALL 不产生重复精彩时刻。未知伤害来源、强化效果、胜负不能猜测。

#### Scenario: New card first play
- **WHEN** 本局观察到新卡入牌组且收到该牌的真实打出事件
- **THEN** 可评论其首次登场，不宣称未观测到的收益或伤害归因

### Requirement: Distinct perspective and run memory
五角色 SHALL 有不同关注点、场景反应和回忆语气并进入真实生成提示。系统 SHALL 保存本局有限的遭遇、残血、恢复和新牌经历，重遇相关敌人时允许回忆；换局或换角色 SHALL 隔离记忆，未知经历不得补造。

#### Scenario: Repeated encounter
- **WHEN** 本局此前在包含该类怪物的战斗中残血，随后再遇到同类
- **THEN** 提供有证据的关联记忆，不指称该怪物必然造成伤害

### Requirement: Clear speaker identity
技能 SHALL 使用可见怪物名/行动名与独立技能样式，AI SHALL 显示角色身份并保留角色框。技能悬停仍显示效果和来源，同类多只怪物可区分。系统 SHALL 提供可阅读的实际人格配置与说明文件。

#### Scenario: Skill and character comment coexist
- **WHEN** 技能介绍与 AI 评论同时可见
- **THEN** 不依赖悬停即可辨认怪物技能与角色感想，技能详情仍可访问
