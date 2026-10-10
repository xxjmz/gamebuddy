## Context

当前 Windows 工作流在标签推送时构建，打包命令未指定 publish 策略，electron-builder 在 CI / 标签环境会隐式自动发布；独立 Release Action 已负责上传。package.json 的 files 白名单遗漏 observation-store 直接依赖的 rest-lifecycle。锁定的 @electron/rebuild 与 node-abi 要求 Node >=22.12，工作流仍为 Node 20。

## Goals / Non-Goals

目标是生成包含全部已有运行依赖的桌面安装包，使发布阶段仅消费成功产物并保留失败诊断。不更改主界面、建议、Bridge 协议或用户存档。

## Decisions

- 保留运行文件白名单，补入缺失的 rest-lifecycle.js。
- dist:win 固定 --publish never，上传由 softprops/action-gh-release 单独完成，避免双重发布和打包阶段凭据依赖。
- Node 22 与 npm ci --include=dev 用于构建；面向普通用户的最终安装流程不应依赖 npm。
- 失败日志写入 GitHub Job Summary，便于公开项目不登录也能定位最后一段错误；日志截断且不输出环境变量。
- 维护者已提供预编译 Mod 和原始 Windows 日志，校验一致。用户授权继续发布；先发布 v0.1.1-rc.1 预发布供实机验收，明确游戏连接和真实 AI 请求尚未验收，不称正式稳定版。Windows CI 必须完成打包、静默安装、安装后依赖加载和应用进程启动检查后才上传公开候选版。

## Risks / Trade-offs

- 本地 Linux 的 NSIS 子进程退出 -1，不能据此认定 Windows 上次是同一原因；Windows 上次日志仍待获取。
- 未取得合法游戏程序集或已编译 Bridge；不能构建和宣称交付完整游戏接入包。
- 仍需 Windows 实机安装及连接验证；打包配置修复不等同于发布成功。
