# Windows 安装包交付记录

## 本次状态

2026-10-10：尚未发布成功，没有可对外提供的最终安装程序。

一次本地 `npm run dist:win -- --publish never` 已完成 Electron 应用打包，但 Linux NSIS 子进程在安装程序生成阶段以 -1 退出。此前 GitHub Windows 构建的完整错误日志仍需仓库授权人提供；不能把 Linux 错误当作 Windows 失败原因。

读取生成的 app.asar 时，确认 observation-store 依赖的 `harness/rest-lifecycle.js` 未被原 files 白名单包含。配置现已补入，需由下一次 Windows 构建确认最终产物。

## 已准备的修复

- `dist:win` 固定 `--publish never`，避免 Electron Builder 在 CI / 标签环境隐式发布；由独立 Release Action 上传。
- files 补入 `harness/rest-lifecycle.js`。
- 构建使用 Node 22，满足锁定的 @electron/rebuild / node-abi 的 Node >=22.12 要求；安装命令包含开发依赖。
- 构建日志保留为 Artifact，失败时将末尾 80 行写入 Job Summary。
- 成功后检查打包文件并生成 SHA-256 校验值。标签 Release 先创建草稿，补齐 Mod 和实机验收后再公开。

## 发布还缺什么

1. 维护者提供已编译可用的 `gamebuddy_bridge.dll` 和 `GameBuddyBridge.json`，并记录对应游戏版本。不能把游戏的 `sts2.dll`、`0Harmony.dll` 等私有程序集放进公开安装包。
2. 原 Windows 失败日志，或授权维护者在 GitHub Actions 的 `Build Windows installer` 中选择本次修复分支进行构建；手动运行会生成 Artifact，不会公开 Release。
3. Windows 真机安装、启动、连接游戏与一次真实 AI 请求验收。
4. 将预编译 Mod 和最终用户安装说明加入 Release，并确认 EXE、Mod ZIP 与校验文件都实际可下载。

## 普通用户的目标流程

1. 下载并运行 GameBuddy Windows 安装程序；不需要 Node.js、npm 或开发工具。
2. 下载预编译 Bridge Mod，解压后将其文件夹放进游戏 `mods` 目录，启用 Mod 并重启游戏；不需要编译 Mod。
3. 安装版通过 Windows 用户环境变量设置模型服务地址、API Key、模型 ID 和接口类型；保存后完整退出并重新启动 GameBuddy，必要时重新登录 Windows 以刷新桌面快捷方式的环境。
4. 启动游戏进入单人局，再从桌面快捷方式启动 GameBuddy，确认 LIVE 和当前角色/楼层一致。
5. 在桌宠底部切换思考模式：开启时分析更充分，建议可能更准确但等待更久；关闭时回复更快。

完整交付前，网站不能把源码 ZIP 标成安装程序，也不能声称用户已经可以免编译连接游戏。取得真实安装资产后，将网站主入口改成安装包下载，开发者源码入口降为次要链接。
