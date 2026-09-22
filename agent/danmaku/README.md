# GameBuddy 弹幕语料检索

弹幕检索使用独立 Chroma collection `gamebuddy_danmaku_v1`，与 Hy-Memory 的玩家偏好 collection 完全分离。

```bash
# 终端一：启动独立本地向量库
npm run danmaku:vdb

# 终端二：将已审核语料向量化并写入 Chroma
npm run danmaku:index

# 从原始采集 JSONL 生成待人工审核队列；该文件不会进入运行时或 Git
npm run danmaku:prepare -- --input ../data/bilibili-sts2-danmaku/danmaku.jsonl
```

运行时先按 `safe=true` 和事件 `trigger` 过滤，再调用 Ollama `nomic-embed-text` 做相似度检索。检索超时或服务不可用时只输出原创句；弹幕从不推导出牌、怪物机制或玩家偏好。
