## ADDED Requirements

### Requirement: Structure and wording checks on published recap text

发布检查 SHALL 核对可渲染结构和明确不合适的措辞。正文、结语和画像中的数值、类型和数值含义 MUST NOT 作为程序发布门槛。模板占位符 SHALL 能解析为可显示文本。

#### Scenario: A model uses numbers in the story body
- **WHEN** 正文直接使用数字，或引用值以数字字符串提供
- **THEN** 程序 MUST NOT 因数值核对、类型差异或单位规则拒绝片段

### Requirement: Interest scoring and one regeneration round

通过结构、标题和措辞检查的模型卡片 SHALL 按 0–3 分评价趣味性。2 分及以上 SHALL 保留模型原文。未达到 2 分的片段 SHALL 有一次重生成机会。新稿 SHALL 经同一检查，仍未通过时 MUST NOT 展示，也不得用低分原稿补位。

#### Scenario: A low-scoring draft is regenerated
- **WHEN** 首轮同时有达标和低分片段
- **THEN** 系统 SHALL 保留达标片段，只为低分片段重生成一次，并只展示复评达到 2 分的有效新稿

#### Scenario: A regenerated draft still fails
- **WHEN** 新稿得分仍低于 2 分，或无法通过结构、标题和措辞检查
- **THEN** 系统 SHALL 省略该片段，允许复盘没有故事卡片
