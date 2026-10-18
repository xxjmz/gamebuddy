## Why

配置模型密钥现在要手改 `.env` 或系统环境变量，改完还得整个退出再启动。桌宠右键应打开密钥页、收下一次粘贴，并立刻用这份密钥调用腾讯云代码助手网关。

## What Changes

- 桌宠右键增加「配置密钥」：用系统浏览器打开 `https://tencent.sso.codebuddy.cn/profile/keys`，同时弹出只收密钥的输入框。
- 确认后把密钥写入本机应用配置，并立刻重建 LLM 客户端。下次启动优先读这份配置，再回退到现有 `.env` 和环境变量。
- 这份配置把模型服务根地址设为 `https://copilot.tencent.com/v2`，接口使用 Chat Completions，认证使用 `X-Api-Key`。
- 密钥不进入日志、仓库文件或操作系统环境变量。探测失败时保留输入，规则模式继续可用。

## Capabilities

### New Capabilities
- `desktop-ui/codebuddy-key-setup`: 桌宠右键打开密钥页、粘贴密钥、本机保存并热加载到 `https://copilot.tencent.com/v2`。

### Modified Capabilities
无。

## Impact

涉及桌宠右键菜单、主进程配置窗口、LLM 客户端的读取顺序与该预设的认证头。现有 DeepSeek 等 Bearer 网关的请求方式保持不变。缺少密钥时仍回退规则，不阻断界面。

## Non-goals

不自动出牌、不点击、不修改游戏状态。不代用户登录 SSO，不拦截密钥页接口，不监听剪贴板。不创建系统或用户环境变量，不改 `.env`。弹窗不收集模型 ID 或网关地址。不把该预设的 `X-Api-Key` 套用到其他模型服务。
