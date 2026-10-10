# GameBuddy Windows 安装指南

GameBuddy Windows 版。安装包构建编号：v0.1.1-rc.1。

## 准备

- Windows 10/11 x64，已安装 Steam 版《杀戮尖塔 2》。Mod 适配基线为 stable v0.107.1，其他游戏版本尚未确认。
- 下载 GameBuddy-Setup-0.1.1-rc.1.exe 和 GameBuddy-Bridge-0.1.1-rc.1.zip。
- 使用 AI 需自备支持 OpenAI 兼容接口的模型服务、API Key、Base URL、模型 ID 和可用额度。无需安装 Node.js、npm、.NET SDK 或自行编译。

## 1. 安装桌面端

运行 EXE，按向导选择安装位置，完成后可通过桌面快捷方式启动。首次使用前先完成下面的 Mod 和模型配置。

当前安装包未配置发行者代码签名证书，Windows 可能显示未知发布者。请确认来自本项目的发布页并核对 SHA256；如需确认文件安全，可先交由系统安全软件检查。

## 2. 安装游戏 Mod

1. 在 Steam 库右键游戏 → 管理 → 浏览本地文件，找到游戏根目录。
2. 完整退出游戏，解压 Mod ZIP，把其中的 GameBuddyBridge 文件夹复制到游戏根目录的 mods 文件夹（没有则创建）。
3. 确认 mods\GameBuddyBridge 内同时有 gamebuddy_bridge.dll 和 GameBuddyBridge.json，避免重复嵌套文件夹。ZIP 中的说明和校验文件无需复制进游戏。
4. 重新启动游戏，按游戏提示启用本地 Mod，确认 GameBuddy Bridge 已启用；如提示重启，请完整重启后再开始单人对局。

## 3. 配置 API Key

目前安装版通过 Windows 用户环境变量配置模型服务。

1. 在 Windows 开始菜单搜索“编辑账户的环境变量”，打开用户变量设置。
2. 在“用户变量”中逐项新建以下变量，前三项必须替换为自己的真实服务信息；不要把占位值照抄进去。

| 变量名 | 填写内容 |
| --- | --- |
| GAMEBUDDY_LLM_BASE_URL | 服务商提供的 API 地址，例如 https://api.example.com/v1（仅示例） |
| GAMEBUDDY_LLM_API_KEY | 你在同一家模型服务控制台创建的 Key |
| GAMEBUDDY_LLM_MODEL | 服务商实际开放的模型 ID |
| GAMEBUDDY_LLM_WIRE_API | 兼容 Chat Completions 填 chat；使用 Responses API 填 responses |
| GAMEBUDDY_LLM_THINKING | 支持 thinking 参数的服务可填 disabled 或 enabled；不支持则不添加此变量 |

3. 保存后，从系统托盘完整退出 GameBuddy。为保证桌面快捷方式读取新环境变量，建议注销并重新登录 Windows，再启动应用。
4. Key 可能产生模型调用费用，只在自己的电脑保存；不要放进仓库、反馈截图或安装包。

不开通模型也可用本地规则建议。配置模型后，关闭思考模式仍使用 AI：开启时分析更充分、建议可能更准确，但回复较慢；关闭时回复更快。可点击桌宠底部“思考模式：开/关”切换；服务是否支持该参数以服务商说明为准。

## 4. 开始使用

1. 启动已启用 Mod 的游戏，开始或继续一局单人游戏。
2. 通过桌面快捷方式启动 GameBuddy，确认主面板显示 LIVE，角色、生命值、楼层与游戏一致。
3. 到卡牌奖励、地图分叉、篝火、事件或商店，等待建议；配置 AI 后在主面板 LLM 日志中确认一次成功的解析结果。仅出现建议不能证明模型调用成功，也可能是本地规则回退。
4. 点顶部建议气泡查看理由，点详情右上角 × 收起；战斗时可点“查看攻略”。按住角色可拖动，单击角色打开主面板。

目前不提供战斗中逐张出牌建议，也不代替玩家操作游戏。

## 常见问题

- 下载无响应：在系统浏览器打开发布页，再点击 Assets 中的文件。需要能访问 GitHub 发布资源的网络。
- 一直未连接：检查两份 Mod 文件、游戏是否启用 Mod 并完整重启、游戏版本及是否进入单人局。
- 没有 AI：检查用户环境变量并注销重登；在 LLM 日志查看实际请求结果。
- 401：Key 无效；403：模型权限不足；404：服务地址、模型或接口类型不匹配；429：额度或频率限制。思考参数报错时先检查服务是否支持。
- 更新 Mod：退出游戏后替换 DLL 与 JSON，再完整重启。退出 GameBuddy 请用系统托盘“退出”。

