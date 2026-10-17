## Validation

2026-10-18：

- `npm run test:danmaku`：62 项通过。新增覆盖五类有证据的精彩事件、重复快照、同名牌副本不能冒充新牌首秀、断线差分隔离、跨战斗回忆、换角色/换局清空、真实 Mod runId 防串局、目标死亡过滤、历史事件过期、六秒错峰、三十秒安静显示、优先队列以及人格/回忆进入实际模型 payload。
- `npm run test:danmaku-renderer`：真实 Electron/preload 验证通过。五角色可见名称，技能单独样式、无玩家头像、可见怪物与技能名、悬停来源保留，重复投递仍只计一次。已查看渲染截图，修复技能框继承固定高度导致文字溢出的问题，并新增内容位于框内的尺寸断言。
- `npm run test:syntax`、`npm run test:agent`（4 项）：通过。
- `node harness/validate-agent.js`：82 项建议回归通过。
- `openspec validate expressive-danmaku-companion --strict`、`git diff --check`：通过。
- `npm run harness:validate-all`：未全通过，停止于 `fact store cases`；工作区另一组 `facts/local-fact-store.test.js:84` 访问不存在的 `gaps[0].from`。本次未修改或回退该数据存储实现。

## Delivered Files

- `agent/danmaku/PERSONAS.md`：完整人格说明、同事实五种观察角度、证据边界和修改入口。
- `agent/danmaku/language-profile.js`：实际运行的人格配置，包含 PROFILES 和 PERSPECTIVES。
- `agent/danmaku/run-memory.js`：本局经历与精彩事件实现。
- `agent/danmaku/README.md`：更新后的运行规则。

## Limits

没有连接真实游戏或调用真实模型；生成文风仍需实机体验。记忆只在当前应用会话内保存。新牌首秀只能确认第一次打出新的牌型，不能推断收益或识别同名新副本。未打包发布或重启用户正在运行的应用，需要重启使用本源码的桌面端生效。截图中的台词为固定预览示例，不是实机模型输出。
