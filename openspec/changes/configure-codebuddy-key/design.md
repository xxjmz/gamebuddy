## Context

见 `proposal.md`。现有客户端在 `agent/llm/openai.js`，启动时读取 `.env` 或进程环境，认证固定为 `Authorization: Bearer`。`normalizeApiRoot` 会保留以 `/v2` 结尾的根地址。Electron 的系统对话框没有文本输入框。

## Goals / Non-Goals

**Goals:**

- 右键只打开配置框；密钥页链接放在配置框里，点击后才打开。
- 有这份配置时，同一次模型调用先走它；失败后再走原来的客户端。
- 没有这份配置时，不改变现有请求。

**Non-Goals:**

- 不替换或清空原来的环境变量配置。
- 不写操作系统环境变量。
- 不在原来的客户端上改认证头。

## Decisions

1. **优先通道和原来的客户端分开。** 本地 JSON 只保存 API Key 和网关。每次调用包一层：先请求优先通道，抛错、超时或没有可用 JSON 时，再用原来的客户端发同一请求。调用方取消时不改走原来的客户端。两个都没有密钥时仍是规则模式。
2. **网关默认是公司个人 token 网关。** 输入框预填 `https://copilot.tencent.com/v2/`，旁边写明「网关」和「公司个人 token 网关」。用户改过的地址按原样规范化后保存。主机为 `copilot.tencent.com` 时请求 `/chat/completions`，认证头使用 `X-Api-Key`。其他网关沿用原来的接口类型和 `Authorization: Bearer`，只替换密钥和根地址。
3. **模型 ID 继续用现有配置。** 弹窗不收集模型。公司网关不接受当前模型时，这次请求失败并回到原来的客户端。
4. **存放在 Electron `userData`。** 文件权限收紧。保存后立刻重建建议、构筑说明和弹幕三个客户端。空白密钥不写入。
5. **对话框用独立小窗口。** 右键只打开小窗口。窗口内的「公司内网 API 获取链接」再调用 `shell.openExternal`。小窗口通过 preload 读取和保存。

## Risks / Trade-offs

- [公司网关可能还要求 CLI 指纹头] → 第一版只对 `copilot.tencent.com` 发送 `X-Api-Key`。真实请求若因此失败，同一轮回到原来的客户端。
- [优先通道超时后再走原来的客户端会更慢] → 这是同一轮请求的失败回退，不提前放弃原来的结果。
- [密钥以明文留在 userData] → 文件权限收紧，日志打码。不写入仓库、不写入系统环境。

## Migration Plan

没有本地网关文件时，启动行为与现在相同。回退时删除 userData 中的该文件并重启，只剩环境变量和 `.env`。

## Open Questions

无。
