## ADDED Requirements

### Requirement: Readable recap card titles

复盘卡片标题 SHALL 围绕本局看点写出逗趣的表达。标题 MUST NOT 写具体血量、血量变化、伤害等战斗报数。自然的数量、楼层和顺序表达 SHALL 可以保留。标题 MUST NOT 设固定字数上限。

#### Scenario: A title reports exact combat values
- **WHEN** 标题出现「血量从46掉到8」或「打了34点伤害」之类的具体战斗数值
- **THEN** 系统 SHALL 要求改写标题，并允许这些数值留在正文

#### Scenario: A title uses natural quantities
- **WHEN** 标题包含「两瓶药」或「第17层」等数量或顺序表达
- **THEN** 系统 MUST NOT 因这些数字或标题字数拒绝该片段

#### Scenario: A good story has a flat title
- **WHEN** 卡片故事分达到门槛，但标题没有逗趣的表达
- **THEN** 标题 SHALL 重写并复评。标题仍未达标时 MUST NOT 发布该卡片。

### Requirement: Group identical monsters in the death label

对局列表的「死于」栏 SHALL 把同名怪物合并为一个名称和对应数量。不同名称 SHALL 分别显示。此规则 SHALL 同样适用于已保存的对局。

#### Scenario: A saved death lists several identical enemies
- **WHEN** 历史对局的死因包含同名怪物
- **THEN** 列表 SHALL 显示名称和数量
