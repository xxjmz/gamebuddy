## ADDED Requirements

### Requirement: One unique local monster line per combat turn

怪物技能台词 SHALL 由本地台词池提供。每场战斗的每个回合 MUST NOT 展示超过一条怪物技能弹幕。换回合后 MUST NOT 播放上一回合排队的台词。应用会话内已播的怪物台词 MUST NOT 再次上屏，台词比较忽略标点和空白。

#### Scenario: Multiple monsters share a turn
- **WHEN** 多只怪物在同一回合出现或换招
- **THEN** 该回合 SHALL 最多播放一条未用过的本地台词

### Requirement: Compact purple monster dialogue style

怪物技能弹幕 SHALL 使用深紫底、小魔角和上方技能标签。正文 SHALL 使用角色弹幕字号。弹幕宽度 SHALL 随台词伸展，长台词 MUST 保持单行完整显示。

#### Scenario: A monster says a long line
- **WHEN** 一条怪物台词比普通台词长
- **THEN** 弹幕 SHALL 横向伸展，台词不换行也不截断
