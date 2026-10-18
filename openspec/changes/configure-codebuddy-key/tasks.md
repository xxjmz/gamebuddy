## 1. 本地密钥配置

- [ ] 1.1 增加可单测的配置读写：非空密钥写入指定目录的本地 JSON，空白和取消不写；本地配置优先于 `.env` 和环境变量；有 `TENCENT_COPILOT_MODEL` 时沿用，否则仅当现有模型已指向 `copilot.tencent.com` 时沿用 `GAMEBUDDY_LLM_MODEL`，否则不启用模型请求。用 `node --test` 覆盖这三种模型来源和空白不写入。
- [ ] 1.2 让该预设请求 `https://copilot.tencent.com/v2/chat/completions` 并发送 `X-Api-Key`；来自 `.env` 的 Bearer 配置仍发送 `Authorization: Bearer`。日志文本不得含密钥。用 `node --test` 断言 URL、请求头和打码。

## 2. 桌宠入口

- [ ] 2.1 在 `showPetContextMenu` 增加「配置密钥」：`shell.openExternal` 打开 `https://tencent.sso.codebuddy.cn/profile/keys`，并打开只含密钥输入的小窗口。取消或空白提交不写文件。用 Electron 冒烟确认菜单项、密钥页地址和取消路径。
- [ ] 2.2 提交后立即重建建议与弹幕的 LLM 客户端。已有模型 ID 时用同一客户端探测一次；失败保留输入并展示去掉密钥后的错误，桌宠和规则模式仍可用。没有模型 ID 时不发请求并说明还缺模型。用注入的假 `fetch` 断言探测 URL，并用 Electron 冒烟确认失败后窗口仍在。

## 3. 验证

- [ ] 3.1 运行 `npm run test:syntax` 和新增的 `node --test` 密钥配置测试，确认通过。
