# Windows 安装包交付记录

## 2026-10-10

维护者已提供预编译 gamebuddy_bridge.dll、GameBuddyBridge.json、适配基线 stable v0.107.1 及原 Windows 完整日志。三项提供的 SHA256 均匹配，DLL 包含有效 PE / CLR 头；文件结构检查不能证明实机可加载。

原 Windows 构建已完成 NSIS 安装程序生成，失败发生在 electron-builder 隐式发布，报错缺少 GH_TOKEN。现已固定 --publish never，由独立 Release Action 使用工作流权限发布。

另外修复 app.asar 缺少 harness/rest-lifecycle.js，构建使用 Node 22 和完整开发依赖。

## 候选版交付

v0.1.1-rc.1 保留为预发布，不覆盖原 v0.1.0 标签。发布前 CI 必须完成 Windows 构建、静默安装、安装后 ASAR 依赖和模型配置解析检查、应用进程启动检查；随附预编译 Mod ZIP、普通用户安装指南和 SHA256。

Mod 原始来源、DLL 和 manifest 校验记录在 distribution/ 下。仅分发维护者提供的 Mod，不分发游戏私有程序集，不包含 API Key。

## 尚待实机验收

CI 没有 Steam 游戏及真实模型账号，不能验证 Mod 加载、LIVE 快照、模型请求成功或完整界面交互。Windows 游戏实机验收完成前不得将候选版标记为正式稳定版。

普通用户流程见 [Windows 安装指南](windows-install-guide.md)：安装 EXE → 复制预编译 Mod → 启用并重启游戏 → 配置用户环境变量 → 通过桌面快捷方式启动并验证 LIVE 和一次真实 AI 请求。不需要源码编译工具。

## CI 结果

Windows 构建与安装启动检查通过：https://github.com/yukiykchen/gamebuddy/actions/runs/38037792440 。EXE SHA256 为 fd741fdff15f5abdb1e35f67f09f2857e943bd35da4f58320bb46145297f5b24。下载后发现 Windows checkout 将 Mod JSON 转为 CRLF，包内原始校验值因此不匹配；添加定向 eol=lf 并通过仅修正分发资产的工作流重新封装 Mod 与校验文件，保留已构建 EXE，不再次构建。
