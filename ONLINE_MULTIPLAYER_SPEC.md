# 《属性商人：精灵收集家》真实多人在线版开发文档

## 1. 项目目标

在现有本地同屏 MVP 基础上，开发一个可通过互联网进行真实多人对战的浏览器策略卡牌游戏。

在线版必须支持：

- 2–5 名玩家使用不同设备加入同一房间。
- 房主创建房间并分享房间码或邀请链接。
- 玩家在准备后由房主开始游戏。
- 服务端统一执行和校验所有游戏规则。
- 所有客户端实时同步房间、回合和游戏状态。
- 断线后可在限定时间内重连并恢复身份。
- 页面刷新后可重新进入原房间。
- 防止重复操作、越权操作及客户端篡改游戏状态。
- 对局结束后展示排名，并允许同一批玩家再次开始。

仍不使用任何第三方角色 IP、官方名称、图片、图标、音乐或设定。

---

## 2. 产品范围

### 2.1 本阶段必须完成

1. 游客身份系统。
2. 创建、加入、退出和解散房间。
3. 房间准备与房主开始游戏。
4. 2–5 人跨设备实时对战。
5. 服务端权威游戏规则。
6. 回合操作实时广播。
7. 断线检测、重连与状态恢复。
8. 房间及对局数据持久化。
9. 游戏日志和系统提示。
10. 终局、排名及再来一局。
11. 基础限流、安全校验和错误处理。
12. 可公开访问的生产环境部署。

### 2.2 本阶段不做

- 排位赛和赛季。
- 好友、私聊和公会。
- 观战与回放。
- 付费系统。
- 卡牌交易。
- 复杂账号体系和第三方登录。
- AI 托管掉线玩家。
- 语音聊天。

---

## 3. 推荐技术架构

### 3.1 前端

- Vite
- React
- TypeScript
- Zustand
- Socket.IO Client
- React Router
- CSS Modules 或现有全局 CSS

### 3.2 服务端

- Node.js 22+
- TypeScript
- Fastify 或 Express
- Socket.IO
- Zod：请求和事件参数校验
- Prisma ORM
- PostgreSQL：房间、身份和对局快照
- Redis：在线状态、房间锁、临时会话和横向扩容适配

首个可运行版本可以暂不使用 Redis，但服务端必须采用可替换的锁与在线状态接口，避免以后重写核心业务。

### 3.3 部署建议

- 前端：Netlify、Vercel 或 Cloudflare Pages。
- API/WebSocket：Render、Railway、Fly.io 或支持长连接的云服务器。
- PostgreSQL：Neon、Supabase、Railway PostgreSQL 等托管服务。
- Redis：Upstash Redis 或同平台托管 Redis。

不得把需要 WebSocket 长连接的服务端部署到不保证长连接生命周期的纯静态托管环境。

### 3.4 仓库结构

建议升级为单仓库：

```txt
apps/
  web/                  # React 前端
  server/               # HTTP + Socket.IO 服务端
packages/
  game-core/            # 纯函数规则引擎，服务端权威使用
  shared/               # 共享类型、事件协议、Zod schema
prisma/
  schema.prisma
docs/
  online-multiplayer.md
```

核心规则不得依赖 React、Socket.IO、数据库或浏览器 API。

---

## 4. 身份与会话

### 4.1 游客身份

玩家首次访问时输入昵称，服务端创建游客身份：

```ts
interface GuestSession {
  playerId: string;
  displayName: string;
  sessionToken: string;
  expiresAt: string;
}
```

- `playerId` 由服务端生成，不接受客户端指定。
- `sessionToken` 使用安全随机值，并只保存其哈希。
- Token 通过 `HttpOnly + Secure + SameSite` Cookie 保存；若跨域部署，应正确配置 CORS 与 Cookie 域。
- 昵称长度 1–12 个字符，过滤控制字符和纯空白。
- 昵称仅用于展示，不作为唯一身份。

### 4.2 会话恢复

刷新页面或浏览器临时断线时，客户端通过 Cookie 恢复身份。服务端返回当前所在房间和对局状态。

游客会话建议保留 7 天；已结束房间可更早清理。

---

## 5. 房间系统

### 5.1 房间状态

```ts
type RoomStatus = "lobby" | "playing" | "finished" | "closed";

interface RoomPlayer {
  playerId: string;
  displayName: string;
  seat: number;
  isHost: boolean;
  isReady: boolean;
  connectionState: "online" | "reconnecting" | "offline";
}

interface Room {
  id: string;
  code: string;
  hostPlayerId: string;
  status: RoomStatus;
  maxPlayers: 2 | 3 | 4 | 5;
  players: RoomPlayer[];
  createdAt: string;
  updatedAt: string;
}
```

### 5.2 创建房间

- 登录态游客可创建房间。
- 房间码为 6 位不易混淆的大写字母和数字，例如 `K7M4Q9`。
- 房间码必须唯一，并具有过期时间。
- 创建者自动成为房主并占据 1 号座位。
- 创建成功后生成邀请链接：`/room/K7M4Q9`。

### 5.3 加入房间

- 可通过房间码或邀请链接加入。
- 房间不存在、已关闭、已开始或已满时拒绝加入。
- 同一身份不能重复占据座位。
- 已在房间中的玩家再次加入时视为重连。
- 对局开始后，只有原房间成员可以重连，不能加入新玩家。

### 5.4 准备与开局

- 非房主玩家可切换准备状态。
- 房主无需单独准备。
- 玩家人数至少为 2，且其他玩家全部准备后，房主才能开始。
- “开始游戏”必须由服务端验证并原子执行。
- 服务端初始化牌堆、市场、徽章、能量池和首位玩家，并广播完整初始状态。

### 5.5 退出与房主转移

- 大厅阶段玩家可主动退出。
- 房主退出时，将房主转移给座位号最小的在线玩家。
- 大厅无人后房间关闭。
- 游戏阶段主动退出视为离线，不立刻删除玩家和游戏数据。
- 游戏阶段所有玩家离线超过清理时间后，房间自动关闭。

---

## 6. 服务端权威原则

客户端只发送“操作意图”，不能直接上传或覆盖游戏状态。

正确示例：

```ts
socket.emit("game:action", {
  roomId,
  actionId: crypto.randomUUID(),
  expectedVersion: 17,
  action: {
    type: "TAKE_DIFFERENT_ENERGIES",
    energyTypes: ["flame", "aqua", "leaf"]
  }
});
```

禁止接收如下客户端数据：

```ts
// 禁止：客户端自行声称获得资源或分数
{ newScore: 15, energies: { flame: 5 } }
```

服务端处理顺序：

1. 验证会话和房间成员身份。
2. 验证房间处于游戏中。
3. 验证当前是否轮到该玩家。
4. 验证 `expectedVersion`。
5. 验证 `actionId` 未处理过。
6. 使用共享规则引擎校验并执行操作。
7. 在数据库事务或房间互斥锁内保存新状态。
8. 增加状态版本号。
9. 向房间所有连接广播新状态和操作结果。

客户端不能决定洗牌顺序、市场补牌、徽章归属、分数、终局或获胜者。

---

## 7. 实时通信协议

### 7.1 连接流程

1. 客户端完成 HTTP 会话恢复。
2. 建立 Socket.IO 连接并携带凭据。
3. 服务端验证身份。
4. 客户端发送 `room:subscribe`。
5. 服务端加入 Socket.IO room，并返回当前权威快照。

### 7.2 客户端发送事件

```ts
interface ClientToServerEvents {
  "room:create": (input: CreateRoomInput, ack: Ack<RoomView>) => void;
  "room:join": (input: JoinRoomInput, ack: Ack<RoomView>) => void;
  "room:subscribe": (input: { roomId: string }, ack: Ack<RoomSnapshot>) => void;
  "room:set-ready": (input: { roomId: string; ready: boolean }, ack: Ack<void>) => void;
  "room:start": (input: { roomId: string }, ack: Ack<void>) => void;
  "room:leave": (input: { roomId: string }, ack: Ack<void>) => void;
  "game:action": (input: GameActionEnvelope, ack: Ack<ActionAccepted>) => void;
  "game:request-sync": (input: { roomId: string }, ack: Ack<GameSnapshot>) => void;
  "game:rematch": (input: { roomId: string; ready: boolean }, ack: Ack<void>) => void;
}
```

### 7.3 服务端广播事件

```ts
interface ServerToClientEvents {
  "room:updated": (room: RoomView) => void;
  "room:closed": (payload: { reason: string }) => void;
  "game:started": (snapshot: GameSnapshot) => void;
  "game:state": (snapshot: GameSnapshot) => void;
  "game:action-rejected": (error: PublicGameError) => void;
  "player:connection": (payload: PlayerConnectionUpdate) => void;
  "game:finished": (result: GameResult) => void;
}
```

### 7.4 统一响应格式

```ts
type Ack<T> = (result:
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }
) => void;
```

不得把数据库错误、堆栈或内部实现信息直接返回客户端。

---

## 8. 游戏状态与版本控制

在线游戏状态沿用本地 MVP 规则，新增以下字段：

```ts
interface OnlineGameState extends GameState {
  roomId: string;
  version: number;
  serverUpdatedAt: string;
  turnStartedAt: string;
  processedActionIds: string[];
}
```

- 每次成功操作后 `version + 1`。
- 客户端提交上次收到的 `expectedVersion`。
- 版本不一致时返回 `STATE_VERSION_CONFLICT`，客户端立即请求完整同步。
- `actionId` 用于幂等处理，避免弱网重试导致重复拿取能量或重复购卡。
- 最近已处理的 action ID 可保留固定数量或单独写入带过期时间的存储。

所有房间操作必须串行处理。单实例可用房间级异步互斥锁；多实例必须使用 Redis 分布式锁或将同一房间稳定路由到同一 worker。

---

## 9. 在线版完整游戏规则

原本地 MVP 的以下规则全部保留：

- 2–5 名玩家。
- 按人数初始化基础能量池，万能能量固定 5 枚。
- 获取 3 个不同基础能量。
- 公共池至少有 4 枚时获取 2 个相同能量。
- 最多持有 10 枚能量，超出后进入弃能量阶段。
- 最多预定 3 张精灵卡，并按规则获得万能能量。
- 捕捉公开卡或自己的预定卡。
- 永久属性折扣和万能能量自动支付。
- 捕捉后自动判定徽章。
- 15 分触发最终轮。
- 完成当前轮后结算。
- 平分时依次比较捕捉卡数量和万能能量数量。

新增在线约束：

- 只有当前玩家可以发送游戏行动。
- 弃能量阶段只接受当前玩家的弃能量操作。
- 每次行动必须经过服务端规则引擎。
- 隐藏信息不得发送给无权查看的玩家。当前版本预定卡为公开展示；如果未来加入暗抽预定，服务端必须按玩家过滤状态。
- 客户端计时仅用于显示，最终时间以服务端为准。

---

## 10. 断线与重连

### 10.1 状态定义

- Socket 断开后立即标记为 `reconnecting`。
- 30 秒内未恢复则标记为 `offline`。
- 玩家座位和对局身份在房间存活期间保留。

### 10.2 重连流程

1. 玩家重新打开邀请链接或刷新页面。
2. 服务端通过会话 Cookie 识别原玩家。
3. 客户端建立新 Socket 连接。
4. 服务端替换该玩家旧 Socket 映射。
5. 服务端返回最新房间与游戏快照。
6. 客户端以服务端快照覆盖本地状态。

### 10.3 掉线期间的回合

首个在线版本不自动替玩家行动：

- 当前玩家掉线时，界面显示等待重连。
- 建议设置 120 秒回合重连等待时间。
- 超时后其他玩家可以一致投票结束该玩家本局资格，或由房主执行“跳过本回合”。
- 为降低首版复杂度，可以先实现“房主在超时后跳过”，服务端必须验证确实已经超时。
- 跳过事件写入游戏日志，不能由客户端伪造。

---

## 11. 数据库设计

建议至少包含以下表：

```prisma
model PlayerSession {
  id           String   @id @default(cuid())
  displayName  String
  tokenHash    String   @unique
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  memberships  RoomMember[]
}

model Room {
  id          String       @id @default(cuid())
  code        String       @unique
  status      RoomStatus   @default(LOBBY)
  maxPlayers  Int
  hostId      String
  gameVersion Int          @default(0)
  gameState   Json?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  expiresAt   DateTime
  members     RoomMember[]
  actions     GameAction[]
}

model RoomMember {
  id        String        @id @default(cuid())
  roomId    String
  playerId  String
  seat      Int
  isReady   Boolean       @default(false)
  joinedAt  DateTime      @default(now())
  room      Room          @relation(fields: [roomId], references: [id])
  player    PlayerSession @relation(fields: [playerId], references: [id])
  @@unique([roomId, playerId])
  @@unique([roomId, seat])
}

model GameAction {
  id             String   @id
  roomId         String
  playerId       String
  resultingVersion Int
  actionType     String
  payload        Json
  createdAt      DateTime @default(now())
  room           Room     @relation(fields: [roomId], references: [id])
  @@index([roomId, resultingVersion])
}
```

生产环境必须配置数据库备份和迁移流程。`gameState` 保存权威快照，`GameAction` 用于审计和故障排查，不要求首版实现完整回放。

---

## 12. 前端页面

### 12.1 首页 `/`

- 输入昵称。
- 创建房间。
- 输入房间码加入。
- 展示连接状态和错误提示。

### 12.2 房间大厅 `/room/:code`

- 房间码和复制邀请链接。
- 玩家列表、座位、房主、准备状态和在线状态。
- 非房主的准备/取消准备按钮。
- 房主的开始游戏按钮。
- 退出房间按钮。

### 12.3 在线对局 `/room/:code/game`

沿用现有游戏面板，并新增：

- 网络连接状态。
- 各玩家在线/离线标记。
- 服务端同步中的加载状态。
- 操作提交中的防重复点击状态。
- 版本冲突后的自动重同步提示。
- 当前玩家掉线等待提示。
- 回合超时和房主跳过入口。

### 12.4 结算页或弹窗

- 最终排名与平分说明。
- 再来一局准备状态。
- 返回首页。

---

## 13. 状态管理边界

前端 Zustand 只负责：

- 当前身份和连接状态。
- 服务端返回的房间快照。
- 服务端返回的游戏快照。
- 本地 UI 状态，如卡牌弹窗和能量选择。
- 正在提交的 action ID。

前端不得继续使用本地 Store 直接执行权威游戏规则。本地规则函数仅可用于预测 UI，例如显示“预计可捕捉”，最终结果仍以服务端为准。

服务端负责：

- 房间生命周期。
- 身份、成员和回合权限校验。
- 洗牌与随机结果。
- 所有游戏行动。
- 分数、徽章、终局和胜者。
- 状态版本、幂等和持久化。

---

## 14. 安全要求

- 所有 HTTP 和 Socket 输入使用 Zod 校验。
- 限制昵称、房间码、action payload 的长度和结构。
- 对创建/加入房间、连接、同步和游戏操作进行 IP 与身份双层限流。
- 严格配置 CORS，只允许正式前端域名。
- 生产环境只允许 HTTPS/WSS。
- Cookie 使用 `HttpOnly`、`Secure` 和合适的 `SameSite`。
- 不在日志中记录原始 session token。
- 数据库使用参数化查询或 ORM。
- 客户端展示昵称和日志时依赖 React 默认转义，禁止直接插入 HTML。
- 服务端验证玩家是否属于房间及是否为当前操作者。
- 防止同一 action 重放和同一房间并发写入。
- 定期清理过期会话、关闭房间和动作幂等记录。

---

## 15. 错误码

至少定义：

```ts
type PublicErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_INPUT"
  | "RATE_LIMITED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "NOT_ROOM_MEMBER"
  | "NOT_ROOM_HOST"
  | "PLAYERS_NOT_READY"
  | "NOT_YOUR_TURN"
  | "INVALID_GAME_PHASE"
  | "INVALID_GAME_ACTION"
  | "ACTION_ALREADY_PROCESSED"
  | "STATE_VERSION_CONFLICT"
  | "GAME_ALREADY_FINISHED"
  | "INTERNAL_ERROR";
```

客户端根据错误码展示友好中文信息，不依赖服务端内部错误文本做业务判断。

---

## 16. 测试要求

### 16.1 规则单元测试

覆盖原 MVP 所有规则，并增加：

- 非当前玩家操作被拒绝。
- 重复 action ID 不会重复执行。
- 旧版本操作被拒绝并触发同步。
- 同房间两个并发操作只有一个成功。
- 服务端忽略客户端伪造的分数和资源。

### 16.2 API/Socket 集成测试

- 创建和加入房间。
- 房间满员、错误房间码和已开局房间。
- 准备与房主开局权限。
- 两个 Socket 接收相同版本状态。
- 玩家断线与重连恢复。
- 刷新后通过会话恢复房间。
- 游戏结束和再来一局。

### 16.3 端到端测试

使用 Playwright 创建 2–5 个独立浏览器上下文：

1. 玩家 A 创建房间。
2. 玩家 B 通过房间码加入。
3. B 准备，A 开始。
4. A 获取能量，B 页面实时更新。
5. B 预定卡，A 页面实时更新。
6. 刷新 B，验证重连后状态一致。
7. 模拟版本冲突并验证自动同步。
8. 完成或构造终局，验证所有客户端排名一致。

### 16.4 压力和稳定性测试

- 至少 100 个同时在线房间的基础压测。
- 单房间连续快速提交非法操作不会破坏状态。
- 服务重启后可从 PostgreSQL 恢复进行中的对局。
- 网络短暂中断后客户端不会重复执行操作。

---

## 17. 开发任务拆分

### 阶段 1：共享规则重构

- 将现有规则提取到 `packages/game-core`。
- 移除浏览器 API 和 Zustand 依赖。
- 为每个 action 建立判定与执行函数。
- 补齐规则单元测试。

验收：Node 服务端可独立导入并执行全部游戏规则。

### 阶段 2：服务端与数据库

- 初始化 Server、Prisma 和 PostgreSQL。
- 实现游客会话。
- 实现房间 CRUD 和成员关系。
- 实现健康检查与统一错误处理。

验收：两个 HTTP 客户端能创建身份并进入同一大厅。

### 阶段 3：实时大厅

- 接入 Socket.IO。
- 实现加入房间频道、准备、离开和房主转移。
- 实现在线状态广播。

验收：两台设备能实时看到玩家与准备状态变化。

### 阶段 4：权威在线对局

- 服务端初始化游戏。
- 实现 action envelope、权限校验、版本和幂等。
- 实现房间级互斥与数据库保存。
- 广播权威快照。

验收：两台设备可完成连续多个回合且状态始终一致。

### 阶段 5：前端在线化

- 新增首页和大厅路由。
- 将游戏 Store 改为服务端快照驱动。
- 增加连接、重试、提交中和错误状态。
- 保留本地 UI 预测但不修改权威状态。

验收：完整线上流程无需开发者工具即可操作。

### 阶段 6：重连与恢复

- 会话恢复。
- Socket 重连与重新订阅。
- 版本冲突自动同步。
- 服务重启后的房间恢复。

验收：刷新或短暂断网后回到同一座位，游戏状态无丢失和重复。

### 阶段 7：生产部署

- 配置生产数据库、环境变量和迁移。
- 部署前端及 WebSocket 服务。
- 配置 HTTPS、CORS、日志和监控。
- 用两种不同网络的设备做最终验收。

验收：通过公开 URL 创建房间，另一台真实设备可加入并完成对局。

---

## 18. 环境变量

服务端至少需要：

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SESSION_SECRET=...
WEB_ORIGIN=https://game.example.com
ROOM_TTL_HOURS=24
RECONNECT_GRACE_SECONDS=30
TURN_DISCONNECT_TIMEOUT_SECONDS=120
```

不得提交真实 `.env`。仓库提供 `.env.example` 和变量说明。

---

## 19. 可观测性与运维

- `/health/live`：进程存活。
- `/health/ready`：数据库及 Redis 可用。
- 结构化日志包含 request ID、room ID 和 action ID，不包含密钥。
- 记录在线 Socket 数、活跃房间数、操作成功率、拒绝错误码和重连率。
- 捕获未处理异常并接入错误监控。
- 数据库迁移必须在部署流程中显式执行。
- 部署失败时支持回滚上一稳定版本。

---

## 20. 最终验收标准

在线版只有同时满足以下条件才算完成：

- 两台位于不同网络的设备可访问公开 HTTPS 地址。
- 玩家 A 创建房间，玩家 B/C/D 可通过房间码加入。
- 房主只能在满足人数与准备条件后开局。
- 每名玩家只能在自己的回合行动。
- 所有合法操作会在其他设备上实时出现。
- 非法、重复、过期和越权操作不会改变状态。
- 刷新页面和短暂断网后可恢复原身份、座位和最新状态。
- 服务端重启后进行中的持久化对局可恢复。
- 完整支持能量、捕捉、预定、万能能量、弃能量、徽章和终局。
- 所有客户端显示一致的最终排名。
- 核心规则测试、Socket 集成测试和多浏览器 E2E 测试通过。
- 生产环境无明显控制台错误，API 和 WebSocket 使用安全连接。

仅能在本机多个标签页运行，或由客户端自行同步状态，不视为真实多人在线版本。

---

## 21. 交付物

- React 在线客户端。
- Node.js + TypeScript 权威服务端。
- PostgreSQL 数据库 schema 和迁移。
- 可选 Redis 适配。
- 共享规则引擎和事件协议包。
- 单元、集成和端到端测试。
- `.env.example`。
- 本地 Docker Compose 开发环境。
- API/Socket 事件说明。
- 部署与故障排查文档。
- 可公开访问的线上地址。
- GitHub 仓库中的完整源代码。
