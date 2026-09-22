## 1. Shared relay protocol

- [ ] 1.1 定义共享弹幕 `join`、`leave`、`message`、`ready`、`rejected` 和 `error` schema，并以 Node 协议测试验证畸形 payload 被拒绝
- [ ] 1.2 新建独立、可通过环境变量配置的 WebSocket relay，按 room hash 路由短生命周期消息，并以集成测试验证同房间可见、异房间隔离
- [ ] 1.3 实现服务端长度/控制字符/策略广告过滤、会话限流与消息 TTL，并以测试验证超限不会影响其他连接
- [ ] 1.4 增加 relay 启动、WSS 配置和禁用/回退说明，验证生产配置拒绝非 WSS 的远程地址

## 2. Desktop opt-in and privacy boundary

- [ ] 2.1 从只读 observation 生成不可逆公共场景签名，验证 payload 不含种子、生命、手牌、牌组、遗物、建议和完整状态
- [ ] 2.2 在主进程实现默认关闭的连接开关、断线退避、场景切换离房与本地 session 隐藏，并以模拟 relay 测试验证
- [ ] 2.3 扩展安全 preload API 和覆盖层消息模型，区分 `player` 来源且不显示发送者身份，验证输入文本不经不安全 IPC 暴露

## 3. Player danmaku UI

- [ ] 3.1 在独立弹幕覆盖层增加 opt-in 状态、短文本发送入口和“隐藏玩家弹幕”控制，验证不会阻塞游戏鼠标操作
- [ ] 3.2 将收到的玩家消息以过期的 `player` 弹幕渲染，场景切换清除旧房间消息；验证 Mod 事实和 B 站来源仍独立显示
- [ ] 3.3 为 relay 不可用、发送被拒绝和本地隐藏提供非阻塞状态文案，验证本地弹幕和推荐持续工作

## 4. Verification

- [ ] 4.1 补充 relay 速率、房间隔离、TTL、过滤和隐私场景签名的 Node 测试并运行 `npm run test:danmaku`
- [ ] 4.2 运行 `npm run test:syntax`、`npm run harness:validate-all` 和 relay 集成测试，验证断线不会影响本地 Mod 事实弹幕
- [ ] 4.3 在 Electron Demo 中验证 opt-in、无身份共享显示、隐藏控制、鼠标穿透与跨场景清理
