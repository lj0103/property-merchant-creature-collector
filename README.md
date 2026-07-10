# 属性商人：精灵收集家

一个受经典资源收集桌游启发的原创精灵收集策略卡牌小游戏。当前仓库已经从“本地同屏版”升级为“本地同屏 + 真实多人在线房间版”。

## 当前交付状态

已完成一个可以实际运行的多人在线版本：玩家可在不同浏览器/设备中连接同一台服务端，通过房间码加入同一房间，准备后开始游戏，并由服务端统一校验和广播所有游戏行动。

当前在线版使用游客身份，支持两种持久化方式：默认本地 JSON 快照；配置 `DATABASE_URL` 后自动切换为 Prisma + PostgreSQL。配置 `REDIS_URL` 后会启用跨实例 Socket.IO 广播、房间分布式锁和在线状态记录。正式账号、HTTPS Cookie 与部署流水线仍属于后续生产化阶段。

## 启动方式

安装依赖：

```bash
npm install
```

本地同屏模式：

```bash
npm run dev
```

线上多人模式需要同时启动前端和服务端：

```bash
npm run dev:online
```

也可以拆开启动：

```bash
npm run dev:server
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- 联机服务端：`http://localhost:8787`
- 健康检查：`http://localhost:8787/health`

如果前端和服务端不在同一台机器或不同域名，设置：

```bash
VITE_SOCKET_URL=http://你的服务端地址:8787
CLIENT_ORIGIN=http://你的前端地址:5173
```

数据库模式：

```bash
cp .env.example .env
npm run db:generate
npm run db:deploy
npm run dev:online
```

没有配置 `DATABASE_URL` 时，服务端会自动退回 JSON 文件存储，默认路径为 `server/data/rooms.json`。

Redis 协调模式（可选）：

```bash
REDIS_URL=redis://localhost:6379 npm run dev:online
```

没有配置 `REDIS_URL`，或启动时无法连接 Redis，服务端会自动退回进程内协调模式。访问 `/health` 可查看当前的 `storage` 与 `realtime` driver。

构建与测试：

```bash
npm run build
npm test
```

## 阶段开发标注

### 阶段 1：本地同屏 MVP（已完成）

开发内容：

- 2–4 名玩家在同一浏览器中轮流游玩。
- 能量获取、预定、捕捉、支付、折扣、徽章、弃牌、最终轮和排名结算。
- 浏览器 `localStorage` 自动保存本地对局。
- 原创卡牌、徽章、元素符号和中文 UI。

主要代码：

- `src/game/types.ts`
- `src/game/setup.ts`
- `src/game/rules.ts`
- `src/store/gameStore.ts`
- `src/components/GameBoard.tsx`

### 阶段 2：规则引擎抽离（已完成）

开发内容：

- 新增 `src/game/actions.ts`。
- 将获取能量、预定卡牌、捕捉卡牌、归还能量等行动抽成纯规则函数。
- 本地 Zustand store 改为调用同一套行动规则。
- 服务端也使用同一套规则，避免客户端和服务端规则分叉。

验收结果：

- `npm test` 通过。
- `npm run build` 通过。

### 阶段 3：多人在线服务端（已完成）

开发内容：

- 新增 `server/index.ts`。
- 使用 Express + Socket.IO 实现长连接联机服务。
- 支持游客身份恢复、房间创建、房间加入、准备状态、房主开始游戏、离开房间、再来一局。
- 服务端权威执行游戏行动，客户端只提交意图。
- 支持行动幂等 `actionId`，减少重复提交造成的状态错误。
- 支持断线后进入 `reconnecting` 状态，超时后标记为 `offline`。
- 使用 JSON 文件保存 session、房间和对局快照，默认位置为 `server/data/rooms.json`。

环境变量：

- `PORT`：服务端端口，默认 `8787`。
- `CLIENT_ORIGIN`：允许跨域访问的前端源，默认 `http://localhost:5173`。
- `RECONNECT_GRACE_MS`：断线重连宽限时间，默认 `60000`。
- `ROOM_DATA_FILE`：房间快照文件路径。

验收结果：

- `npm run server` 可启动服务端。
- `/health` 返回 `{"ok":true,...}`。

### 阶段 4：多人在线前端（已完成）

开发内容：

- 首页新增“进入线上多人房间”入口。
- 新增 `src/components/OnlineGame.tsx`。
- 支持设置昵称、创建房间、加入房间、展示房间码、玩家准备、房主开局。
- 在线对局中显示玩家在线状态、当前回合、公共能量池、市场、玩家手牌/预定区、日志和结算弹窗。
- 所有在线行动通过 Socket.IO 发送到服务端，由服务端校验后广播房间状态。
- 页面刷新后使用本地保存的游客 token 恢复身份和房间。

主要代码：

- `src/components/OnlineGame.tsx`
- `src/multiplayer/protocol.ts`
- `src/components/CreatureCard.tsx`
- `src/App.tsx`

### 阶段 5：文档与运行说明（已完成）

开发内容：

- README 补充本地/联机启动方式。
- README 标注每个阶段的功能范围、主要代码和验收结果。
- 新增真实多人在线完整开发规格文档：[ONLINE_MULTIPLAYER_SPEC.md](./ONLINE_MULTIPLAYER_SPEC.md)。

### 阶段 6：PostgreSQL + Prisma 持久化（已完成）

开发内容：

- 新增 `prisma/schema.prisma`，定义游客会话和房间快照表。
- 新增 `prisma/migrations/20260709122000_init/migration.sql`，用于生产环境迁移。
- 新增 `server/storage.ts`，将持久化层抽象为 JSON / Prisma 两种 driver。
- 服务端启动时自动判断：有 `DATABASE_URL` 且未设置 `STORAGE_DRIVER=json` 时使用 Prisma；否则使用 JSON。
- `/health` 返回当前存储 driver，便于部署后确认运行模式。
- 新增 `.env.example`，标注前端、服务端和数据库环境变量。

主要代码：

- `server/storage.ts`
- `prisma/schema.prisma`
- `prisma/migrations/20260709122000_init/migration.sql`

验收结果：

- `npm run db:generate` 通过。
- `npm test` 通过。
- `npm run build` 通过。

### 阶段 7：Redis 实时协调与房间并发控制（已完成）

开发内容：

- 新增 `server/realtime.ts`，封装 Redis / 内存两种实时协调 driver。
- 配置 `REDIS_URL` 后启用 Socket.IO Redis adapter，使房间事件可跨服务端实例广播。
- 为加入、准备、开局、游戏行动、重开、离开和断线状态更新增加房间级串行锁。
- Redis 模式使用带随机令牌和过期时间的分布式锁，并用 Lua 脚本安全释放锁。
- 记录玩家 `online`、`reconnecting`、`offline` 状态，并设置在线状态 TTL。
- 各服务端实例通过内部 `room:sync` 事件同步房间快照缓存。
- Redis 缺失或连接失败时自动使用进程内队列锁，不影响单机开发和单实例部署。
- `/health` 新增 `realtime` 字段，可确认当前运行在 `redis` 或 `memory` 模式。

环境变量：

- `REDIS_URL`：Redis 连接地址。
- `REDIS_LOCK_TTL_MS`：房间分布式锁过期时间，默认 `5000`。
- `REDIS_PRESENCE_TTL_SECONDS`：在线状态过期时间，默认 `120`。

主要代码：

- `server/realtime.ts`
- `server/index.ts`

验收结果：

- `npm test` 通过。
- `npm run build` 通过。
- 无 Redis 环境下服务端可正常启动，`/health` 返回 `"realtime":"memory"`。

## 游戏规则

每回合选择一项行动：获取三种不同基础能量、在公共池至少有四枚时获取两枚同种能量、预定一张公开精灵卡，或捕捉一张公开/已预定的精灵卡。

- 已捕捉精灵永久提供对应属性 1 点折扣。
- “灵”是万能能量，自动补足捕捉成本。
- 预定最多三张，并在公共池有余量时获得一枚万能能量。
- 持有能量超过十枚时必须立即归还至十枚。
- 捕捉后若满足条件，会自动获得尚未归属的徽章。
- 任一玩家达到 15 分后完成当前轮，再按分数结算。
- 平分依次比较：捕捉卡较少、万能能量较少；仍相同则并列获胜。

## 技术结构

- Vite + React + TypeScript
- Zustand：本地同屏状态管理与持久化
- Express + Socket.IO：多人在线房间服务
- Prisma + PostgreSQL：生产数据库持久化
- Redis：跨实例事件广播、在线状态与房间分布式锁
- Zod：服务端输入校验
- `src/game`：初始化、规则、计分、行动执行等纯逻辑
- `src/multiplayer`：前后端共享联机协议类型
- `src/data`：原创精灵卡与徽章配置
- `src/components`：本地游戏、线上房间和卡牌 UI
- `server`：HTTP + WebSocket 多人服务端

## 当前在线版能力边界

已经支持真实跨设备联机，并已具备 Redis 多实例协调基础：

- 不配置 Redis 时适合本机、局域网或单台云服务器部署。
- 默认房间快照持久化到 JSON 文件；配置 `DATABASE_URL` 后使用 PostgreSQL。
- 配置 Redis 后可跨实例广播事件、同步房间缓存并串行处理同一房间操作。
- 游客 token 存在浏览器 localStorage 中。
- 尚未接入正式账号体系和 HTTPS Cookie。
- 正式多实例部署应同时使用 PostgreSQL + Redis，并在负载均衡器启用 WebSocket 与会话粘滞；后续仍需把游客会话查询改为共享缓存或数据库按需读取。

## 后续生产化阶段

建议按以下顺序继续：

1. 将游客 token 改为 `HttpOnly + Secure + SameSite` Cookie，并支持共享会话查询。
2. 增加服务端集成测试和多客户端端到端测试。
3. 增加部署配置、日志、监控、限流和房间清理任务。
4. 部署前端静态站点与独立 WebSocket 服务。

本项目中的名称、视觉符号与文案均为原创，不使用任何第三方角色 IP 素材。
