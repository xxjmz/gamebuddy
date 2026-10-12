## Context

当前 Windows 工作流在标签推送时构建，打包命令未指定 publish 策略，electron-builder 在 CI / 标签环境会隐式自动发布；独立 Release Action 已负责上传。package.json 的 files 白名单遗漏 observation-store 直接依赖的 rest-lifecycle。锁定的 @electron/rebuild 与 node-abi 要求 Node >=22.12，工作流仍为 Node 20。

## Goals / Non-Goals

目标是生成包含全部已有运行依赖的桌面安装包，使发布阶段仅消费成功产物并保留失败诊断。不更改主界面、建议、Bridge 协议或用户存档。

## Decisions

- 保留运行文件白名单，补入缺失的 rest-lifecycle.js。
- dist:win 固定 --publish never，上传由 softprops/action-gh-release 单独完成，避免双重发布和打包阶段凭据依赖。
- Node 22 与 npm ci --include=dev 用于构建；面向普通用户的最终安装流程不应依赖 npm。
- 失败日志写入 GitHub Job Summary，便于公开项目不登录也能定位最后一段错误；日志截断且不输出环境变量。
- 维护者已提供预编译 Mod 和原始 Windows 日志，校验一致。维护者已确认可用，沿用 v0.1.1-rc.1 构建正式发布。Windows CI 完成打包、静默安装、安装后依赖加载和应用进程启动检查后上传发布资源。

## Risks / Trade-offs

- 本地 Linux 的 NSIS 子进程退出 -1；已取得的 Windows 日志确认原失败原因是隐式发布缺少 GH_TOKEN。
- Mod 使用维护者提供的预编译文件，公开发布资源不包含游戏私有程序集。

## Release decision update

维护者已确认可以使用，将现有 Release 标记为正式 / Latest，保留既有构建编号、标签和 EXE 原始字节。
