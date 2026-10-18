## Context

见 `proposal.md`。当前密钥只在启动时从 `.env` 或进程环境读入，`loadProjectEnv` 只执行一次。`normalizeApiRoot` 会保留以 `/v2` 结尾的根地址，Chat Completions 再拼上 `/chat/completions`。现有请求固定发送 `Authorization: Bearer`。Electron 的系统对话框没有文本输入框。

## Goals / Non-Goals

**Goals:**

- 右键打开密钥页，并用应用自己的小窗口收下一次粘贴。
- 本地配置立即生效，下次启动仍优先于 `.env` 和环境变量。
- 该预设请求 `https://copilot.tencent.com/v2/chat/completions`，认证头为 `X-Api-Key`。

**Non-Goals:**

- 不代填 SSO，不抓密钥页接口，不监听剪贴板。
- 不写操作系统环境变量。
- 不在这个预设之外改 Bearer 认证。

## Decisions

1. **本地配置文件是唯一新增存放处。** 写入 Electron `userData` 下仅当前用户可读的 JSON。当前进程同时更新内存中的 LLM 配置并重建建议客户端和弹幕客户端。这样 Mac 从程序坞启动、Windows 安装目录不可写时都能在下次启动读到。备选的系统环境变量对已经运行的进程无效，Mac 图形程序也读不到终端变量。
2. **网关预设固定为 `https://copilot.tencent.com/v2`，接口为 chat。** `normalizeApiRoot` 看到 `/v2` 后不会再追加 `/v1`，最终 URL 是 `https://copilot.tencent.com/v2/chat/completions`。密钥页 `https://tencent.sso.codebuddy.cn/profile/keys` 只负责给人复制密钥，不承担模型调用。
3. **只有这份预设使用 `X-Api-Key`。** 配置里记录认证方式。来自 `.env` 的 DeepSeek 等配置继续发送 Bearer。不把 `X-Api-Key` 变成全局默认。
4. **模型 ID 不进弹窗。** 已有 `TENCENT_COPILOT_MODEL` 时沿用。否则仅当当前模型本来就指向 `copilot.tencent.com` 时沿用 `GAMEBUDDY_LLM_MODEL`。都没有时保存密钥和网关，但不启用模型请求，避免把默认的 `deepseek-v4-pro` 发到该网关。
5. **对话框用独立小窗口。** `shell.openExternal` 打开系统浏览器。小窗口通过 preload 提交或取消；主进程校验非空后再保存。提交失败时窗口保持打开。
6. **探测与正式请求走同一客户端。** 有模型 ID 时保存后发一次短请求。失败展示状态码和截断后的错误，错误文本先去掉密钥。规则模式不依赖探测结果。

## Risks / Trade-offs

- [网关可能还要求 CLI 指纹头] → 第一版只发送 `X-Api-Key` 和 `Content-Type`。真实探测若因缺头失败，再单独立项补最小头，不提前猜测头集合。
- [本地配置会盖过 `.env`] → 这是玩家显式保存后的结果。删掉该用户配置文件即可回到环境变量。
- [密钥以明文留在 userData] → 文件权限收紧，日志打码。不写入仓库、不写入系统环境。
- [密钥页主机和模型网关主机不同] → 菜单打开玩家指定的 SSO 密钥页；模型请求始终去 `copilot.tencent.com`。

## Migration Plan

没有旧的本地密钥文件时，启动行为与现在相同。回退时删除 userData 中的该配置并重启，环境变量和 `.env` 重新生效。

## Open Questions

无。默认模型名未指定，因此没有腾讯模型 ID 时不发起请求；这已在规格中定下来。
