# 验证原型

7 个相互独立的 TypeScript 脚本，每个目录自带 `package.json`，不共享代码、不组成 workspace。用 `tsx` 直接运行，不需要先编译。

这里的 `npm test` 指的是"跑一遍验证并打印结果"，**不是单元测试**：脚本不写断言，跑完打印统计并以退出码 0 结束。判定标准在 `docs/00_验证报告.md` 里。

## 环境

- 本次复跑：Windows 11 / Node 26.13.0 / `tsx` 4.x。
- 每个目录第一次运行前先 `npm install`（会重新生成 `package-lock.json`，仓库里已带锁文件）。
- 全部脚本是单进程、单机，不监听端口（v1 例外，它在 3007 端口起本地 WS 服务）。

## 逐项运行

### v1 部位伤害判定

```bash
cd v1-hit-location
npm install
npm test          # 等价于 npx tsx src/tests/automated.ts
```

- 起一个本地 HTTP+WS 服务，两个客户端，5 种模拟延迟各 50 次攻击，约 15 秒。
- **只保留了服务端与自动化测试**：客户端渲染文件与共享类型在迁移中损坏为全零，已移除。`npm run server` 仍会启动，但访问 `/` 会 404。
- 输出形如 `0ms: 50/50 hits(100%) avgRTT=5ms srv=0.220ms`。

### v2 天道事件流 + 链式哈希日志

```bash
cd v2-tiandao-events
npm install
npm test
```

- 6 个场景共约 30 秒。
- 吞吐被事件循环定时器限制，名义 50K/100K/200K 发不满，属预期。
- 输出 6 行，每行含吞吐、事件数、封神检测数、日志校验条数与耗时。

### v4 地图分块流式

```bash
cd v4-map-streaming
npm install
npm test
```

- 4 个场景，约几秒；100 人场景会真实分配约 1.15 GB 缓冲区，内存紧张时不要跑。
- 帧时间是模型值，不是渲染测量，详见验证报告 §2.3。

### v5 NPC 社交与记忆

```bash
cd v5-npc-social
npm install
npm test                        # 默认 1,000 NPC
NPC_COUNT=10000 npm test        # 报告口径，约 500 万条记忆
```

- `NPC_COUNT` 只影响 NPC 数量；每个 NPC 约 500 条记忆。
- 10,000 规模会占用大量内存，生成约 2–3 秒。
- 输出含记忆总数、社交边数、查询 avg/p95/p99、衰减比例、玩家全表扫描耗时。

### v6 残像同步

```bash
cd v6-afterimage-sync
npm install
npm test
```

- 4 组数值仿真，无真实网络，约 1 秒。
- 输出 `avgDrift` / `maxDrift` / `maxClientDiff`。

### v7 动态技能池战斗 AI

```bash
cd v7-combat-ai
npm install
npm test
```

- 技能池 10–500 与 1–50 个并发 Boss，约几秒。
- `variety` 是"用到的技能数 / 池大小"，受采样次数与冷却限制，不代表行为多样性。

### v8 全链路集成

```bash
cd v8-integration
npm install
npm test
```

- 100 玩家 + 20 NPC + 2 半神，2400 tick，不按实时节流，约 0.1 秒跑完。
- 输出 8 条检查的通过情况和性能统计。

## 本次复跑的原始输出

`results/2026-11-07/` 下按验证项保存了 7 份 stdout，未加工。它们与脚本当前的默认参数一致（v5 为该目录下一次 `NPC_COUNT=10000` 的运行）。

## 不要从这里推断的东西

- 这些脚本的耗时是单机、单进程、无并发的数字，不是服务端承载能力。
- v1/v8 的 100% 命中是瞄准构造；v4 的帧时间是模型值；v6 没有真实网络；v8 没有实时节流。
- 没有单元测试、没有回归基线、没有 CI。改动脚本后请重新保存一份结果，不要沿用旧日志。
