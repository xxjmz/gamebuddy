## Why

宣传站面向普通玩家，源码下载后安装依赖、编译 Mod 的流程不能替代安装包交付。上次 Windows 标签构建失败；本次检查还发现安装资源遗漏启动时必需的 harness/rest-lifecycle.js。

## What Changes

- 补全 Windows 桌面安装包的运行时文件。
- 显式禁用打包阶段的自动发布，仅由独立 Release 步骤上传成功生成的安装包。
- CI 使用满足锁定依赖要求的 Node.js 22，并显式安装开发依赖。
- 构建失败时保留日志并写入任务摘要，成功时提供安装包校验值。
- 将预编译 Bridge Mod 与安装版使用说明作为完整体验交付的前置条件；缺少 Mod 时不声称已经实现免编译接入。

## Capabilities

### New Capabilities

无。当前改动限于已有桌面功能的打包配置、构建工作流与发布文档，使用 skip_specs。

### Modified Capabilities

无。建议行为和 Bridge 协议保持原规格。

## Impact

涉及 package.json、Windows GitHub Actions、发布文档。不分发游戏私有程序集，不包含用户密钥。

## Non-goals

不新增自动出牌、游戏状态修改或 Mod 采集行为；不将失败构建、源码包或未经验证的 Mod 标为可安装正式版。
