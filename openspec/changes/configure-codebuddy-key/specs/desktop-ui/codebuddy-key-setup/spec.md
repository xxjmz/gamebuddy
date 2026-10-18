## Purpose

让玩家从桌宠右键打开密钥页并粘贴一次密钥，GameBuddy 立刻用这份密钥调用腾讯云代码助手的模型网关，不用改环境变量或重启。

## ADDED Requirements

### Requirement: Pet context menu opens the key page and a paste dialog
桌宠右键菜单 SHALL 提供「配置密钥」。选择后系统浏览器 MUST 打开 `https://tencent.sso.codebuddy.cn/profile/keys`，同时 MUST 出现一个只接受密钥粘贴的对话框。取消或空白提交 MUST NOT 写入配置。

#### Scenario: Configure key from the pet
- **WHEN** 玩家在桌宠上右键并选择「配置密钥」
- **THEN** 系统浏览器打开密钥页，并显示密钥输入框

#### Scenario: Cancel leaves configuration unchanged
- **WHEN** 玩家打开对话框后取消，或提交空白内容
- **THEN** 已有模型配置保持不变，也不新增本地密钥

### Requirement: Saved key is applied immediately from local app configuration
确认一份非空密钥后，应用 MUST 把它写入当前用户的应用本地配置，并立刻让后续模型请求使用它。下次启动 MUST 优先使用这份本地配置，再回退到 `.env` 和进程环境变量。保存 MUST NOT 创建或修改操作系统环境变量，也 MUST NOT 修改仓库 `.env`。日志、界面和错误文本 MUST NOT 显示完整密钥。

#### Scenario: Key works without restart
- **WHEN** 玩家提交一份非空密钥
- **THEN** 后续模型请求使用该密钥，无需退出应用

#### Scenario: Next launch reads the saved key
- **WHEN** 应用重新启动且本地配置里已有密钥
- **THEN** 模型请求使用该密钥，即使进程环境变量和 `.env` 里没有密钥

#### Scenario: Operating system environment stays unchanged
- **WHEN** 玩家保存密钥
- **THEN** 操作系统的用户环境变量和系统环境变量都不包含这份新密钥

### Requirement: Requests use the CodeBuddy chat gateway
由该对话框保存的配置 MUST 把模型请求发到 `https://copilot.tencent.com/v2/chat/completions`，并用 `X-Api-Key` 携带密钥。该预设 MUST NOT 使用 `Authorization: Bearer`。其他来源的模型配置 MUST 继续使用原来的 Bearer 认证。已配置的腾讯模型 ID MUST 被沿用；没有腾讯模型 ID 时 MUST NOT 把 DeepSeek 默认模型发给该网关，对话框 MUST 说明还缺模型，且规则模式继续可用。

#### Scenario: Chat request reaches the v2 gateway
- **WHEN** 本地配置已有密钥和腾讯模型 ID，并产生一次模型请求
- **THEN** 请求发往 `https://copilot.tencent.com/v2/chat/completions`，请求头包含 `X-Api-Key`

#### Scenario: Existing Bearer providers stay on Bearer
- **WHEN** 模型配置来自原有 DeepSeek 或其他 Bearer 网关，而不是这份对话框配置
- **THEN** 请求仍使用 `Authorization: Bearer`

#### Scenario: Missing model does not call the gateway
- **WHEN** 玩家保存了密钥，但没有已配置的腾讯模型 ID
- **THEN** 不向该网关发送模型请求，对话框说明还缺模型，建议继续使用规则模式

### Requirement: A failed check does not block the game companion
保存后若已经具备模型 ID，应用 MUST 做一次连通探测。探测失败时 MUST 保留对话框中的密钥输入并说明失败，且 MUST NOT 阻断桌宠、对局建议或规则模式。

#### Scenario: Gateway rejects the key
- **WHEN** 探测返回认证失败或网关错误
- **THEN** 对话框仍可修改并再次提交，桌宠和对局界面保持可用
