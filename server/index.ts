import cors from 'cors';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { z } from 'zod';
import { applyGameAction, type GameAction } from '../src/game/actions';
import { createGame } from '../src/game/setup';
import type {
  ClientToServerEvents,
  ConnectionState,
  RoomPayload,
  ServerErrorPayload,
  ServerToClientEvents,
} from '../src/multiplayer/protocol';
import { createRealtimeCoordinator } from './realtime';
import { createRoomStorage, type RoomRecord, type SessionRecord } from './storage';

type SocketData = { playerId?: string; sessionToken?: string };
type InterServerEvents = { 'room:sync': (room: RoomRecord) => void };

const app = express();
const httpServer = createServer(app);
const allowedOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const port = Number(process.env.PORT ?? 8787);
const reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS ?? 60_000);
const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? 'pm_session';
const sessionCookieMaxAgeMs = Number(process.env.SESSION_COOKIE_MAX_AGE_MS ?? 30 * 24 * 60 * 60 * 1_000);
const cookieSecure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
const storage = createRoomStorage();

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: allowedOrigin, credentials: true },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin;
    callback(null, !origin || origin === allowedOrigin);
  },
});
const realtime = await createRealtimeCoordinator(io);

const sessions = new Map<string, SessionRecord>();
const rooms = new Map<string, RoomRecord>();
const reconnectTimers = new Map<string, NodeJS.Timeout>();

const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .transform((value) => value.replace(/[\u0000-\u001f\u007f]/g, '').trim())
  .pipe(z.string().min(1).max(12));
const maxPlayersSchema = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const roomCodeSchema = z.string().trim().min(4).max(8).transform((value) => value.toUpperCase());
const sessionRequestSchema = z.object({
  displayName: z.string().optional(),
  legacySessionToken: z.string().min(1).max(128).optional(),
});

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
const makeCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 5; index += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
};
const error = (code: string, message: string): ServerErrorPayload => ({ code, message });
const toSessionPayload = (session: SessionRecord) => ({
  playerId: session.playerId,
  displayName: session.displayName,
});

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key !== name) continue;
    try {
      return decodeURIComponent(valueParts.join('='));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function findSharedSession(sessionToken: string) {
  const cached = sessions.get(sessionToken);
  if (cached) return cached;
  const stored = await storage.findSession(sessionToken);
  if (stored) sessions.set(sessionToken, stored);
  return stored;
}

const toRoomPayload = (room: RoomRecord): RoomPayload => ({
  id: room.id,
  code: room.code,
  hostPlayerId: room.hostPlayerId,
  status: room.status,
  maxPlayers: room.maxPlayers,
  players: room.players,
  gameState: room.gameState,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
});

async function persist() {
  await storage.save({
    sessions: [...sessions.values()],
    rooms: [...rooms.values()].filter((room) => room.status !== 'closed'),
  });
}

async function loadPersistedData() {
  const payload = await storage.load();
  payload.sessions?.forEach((session) => sessions.set(session.sessionToken, session));
  payload.rooms?.forEach((room) => rooms.set(room.id, room));
}

function findRoomByPlayer(playerId: string) {
  return [...rooms.values()].find(
    (room) => room.status !== 'closed' && room.players.some((player) => player.playerId === playerId),
  );
}

function findRoomByCode(code: string) {
  return [...rooms.values()].find((room) => room.code === code && room.status !== 'closed');
}

function broadcastRoom(room: RoomRecord) {
  io.to(room.id).emit('room:update', toRoomPayload(room));
  if (realtime.driver === 'redis') io.serverSideEmit('room:sync', structuredClone(room));
}

function touchRoom(room: RoomRecord) {
  room.updatedAt = now();
}

function requireSession(socket: { data: SocketData }) {
  if (!socket.data.sessionToken) return undefined;
  return sessions.get(socket.data.sessionToken);
}

async function setPlayerConnection(playerId: string, connectionState: ConnectionState) {
  await realtime.setPlayerPresence(playerId, connectionState);
  const foundRoom = findRoomByPlayer(playerId);
  if (!foundRoom) {
    await persist();
    return;
  }
  await realtime.withRoomLock(foundRoom.id, async () => {
    const room = rooms.get(foundRoom.id);
    const player = room?.players.find((item) => item.playerId === playerId);
    if (!room || !player) return;
    player.connectionState = connectionState;
    touchRoom(room);
    await persist();
    broadcastRoom(room);
  });
}

function ensureHost(room: RoomRecord, playerId: string) {
  return room.hostPlayerId === playerId;
}

function ensureLobby(room: RoomRecord) {
  return room.status === 'lobby';
}

function closeRoomIfEmpty(room: RoomRecord) {
  if (room.players.every((player) => player.connectionState === 'offline')) {
    room.status = 'closed';
    io.to(room.id).emit('room:closed', { message: '房间内已无在线玩家，房间已关闭。' });
  }
}

app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json());
app.post('/api/session', async (request, response) => {
  const bodyResult = sessionRequestSchema.safeParse(request.body);
  if (!bodyResult.success) return response.status(400).json({ error: error('BAD_REQUEST', '会话参数无效') });

  const nameResult = displayNameSchema.safeParse(bodyResult.data.displayName ?? '旅人');
  const displayName = nameResult.success ? nameResult.data : '旅人';
  const cookieToken = readCookie(request.headers.cookie, sessionCookieName);
  const requestedToken = cookieToken ?? bodyResult.data.legacySessionToken;
  let session = requestedToken ? await findSharedSession(requestedToken) : undefined;

  if (!session) {
    session = {
      playerId: makeId('player'),
      displayName,
      sessionToken: makeId('session'),
      lastSeenAt: now(),
    };
  }

  session.displayName = displayName || session.displayName;
  session.lastSeenAt = now();
  sessions.set(session.sessionToken, session);
  await storage.saveSession(session);
  response.cookie(sessionCookieName, session.sessionToken, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: 'lax',
    maxAge: sessionCookieMaxAgeMs,
    path: '/',
  });

  const room = findRoomByPlayer(session.playerId);
  return response.json({ session: toSessionPayload(session), room: room ? toRoomPayload(room) : undefined });
});
app.get('/health', (_request, response) => {
  response.json({ ok: true, storage: storage.driver, realtime: realtime.driver, rooms: rooms.size, time: now() });
});

io.on('room:sync', (room) => {
  if (room.status === 'closed') rooms.delete(room.id);
  else rooms.set(room.id, room);
});

io.use(async (socket, next) => {
  try {
    const sessionToken = readCookie(socket.handshake.headers.cookie, sessionCookieName);
    const session = sessionToken ? await findSharedSession(sessionToken) : undefined;
    if (!session) return next(new Error('UNAUTHORIZED'));
    socket.data.playerId = session.playerId;
    socket.data.sessionToken = session.sessionToken;
    next();
  } catch {
    next(new Error('SESSION_LOOKUP_FAILED'));
  }
});

io.on('connection', (socket) => {
  socket.on('session:restore', async (payload, reply) => {
    const authenticatedSession = requireSession(socket);
    if (!authenticatedSession) {
      return reply({ error: error('UNAUTHORIZED', '安全会话已失效，请重新连接') });
    }
    const nameResult = displayNameSchema.safeParse(payload.displayName ?? '旅人');
    const displayName = nameResult.success ? nameResult.data : '旅人';
    const session = authenticatedSession;

    session.displayName = displayName || session.displayName;
    session.socketId = socket.id;
    session.lastSeenAt = now();
    socket.data.playerId = session.playerId;
    socket.data.sessionToken = session.sessionToken;
    await realtime.setPlayerPresence(session.playerId, 'online');

    const reconnectTimer = reconnectTimers.get(session.playerId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimers.delete(session.playerId);
    }

    const room = findRoomByPlayer(session.playerId);
    if (room) {
      await socket.join(room.id);
      const roomPlayer = room.players.find((player) => player.playerId === session!.playerId);
      if (roomPlayer) {
        roomPlayer.displayName = session.displayName;
        roomPlayer.connectionState = 'online';
        touchRoom(room);
        broadcastRoom(room);
      }
    }

    await persist();
    reply({ session: toSessionPayload(session), room: room ? toRoomPayload(room) : undefined });
  });

  socket.on('room:create', async (payload, reply) => {
    const session = requireSession(socket);
    if (!session) return reply({ error: error('UNAUTHORIZED', '请先设置昵称并建立游客身份') });

    const maxPlayersResult = maxPlayersSchema.safeParse(payload.maxPlayers);
    if (!maxPlayersResult.success) return reply({ error: error('BAD_REQUEST', '房间人数必须是 2、3 或 4') });

    const existingRoom = findRoomByPlayer(session.playerId);
    if (existingRoom) existingRoom.players = existingRoom.players.filter((player) => player.playerId !== session.playerId);

    let code = makeCode();
    while (findRoomByCode(code)) code = makeCode();

    const createdAt = now();
    const room: RoomRecord = {
      id: makeId('room'),
      code,
      hostPlayerId: session.playerId,
      status: 'lobby',
      maxPlayers: maxPlayersResult.data,
      players: [
        {
          playerId: session.playerId,
          displayName: session.displayName,
          seat: 1,
          isHost: true,
          isReady: true,
          connectionState: 'online',
        },
      ],
      createdAt,
      updatedAt: createdAt,
      processedActionIds: [],
    };

    rooms.set(room.id, room);
    await socket.join(room.id);
    await persist();
    broadcastRoom(room);
    reply({ room: toRoomPayload(room) });
  });

  socket.on('room:join', async (payload, reply) => {
    const session = requireSession(socket);
    if (!session) return reply({ error: error('UNAUTHORIZED', '请先设置昵称并建立游客身份') });

    const codeResult = roomCodeSchema.safeParse(payload.code);
    if (!codeResult.success) return reply({ error: error('BAD_REQUEST', '请输入有效房间码') });

    const room = findRoomByCode(codeResult.data);
    if (!room) return reply({ error: error('NOT_FOUND', '找不到这个房间') });
    if (room.status !== 'lobby') return reply({ error: error('ROOM_LOCKED', '对局已开始，不能加入新玩家') });

    try {
      await realtime.withRoomLock(room.id, async () => {
        if (room.status !== 'lobby') return reply({ error: error('ROOM_LOCKED', '对局已开始，不能加入新玩家') });
        const existingPlayer = room.players.find((player) => player.playerId === session.playerId);
        if (!existingPlayer) {
          if (room.players.length >= room.maxPlayers) return reply({ error: error('ROOM_FULL', '房间人数已满') });
          room.players.push({
            playerId: session.playerId,
            displayName: session.displayName,
            seat: room.players.length + 1,
            isHost: false,
            isReady: false,
            connectionState: 'online',
          });
        } else {
          existingPlayer.displayName = session.displayName;
          existingPlayer.connectionState = 'online';
        }

        touchRoom(room);
        await socket.join(room.id);
        await persist();
        broadcastRoom(room);
        reply({ room: toRoomPayload(room) });
      });
    } catch {
      reply({ error: error('ROOM_BUSY', '房间操作繁忙，请稍后重试') });
    }
  });

  socket.on('room:ready', async (payload, reply) => {
    const session = requireSession(socket);
    const room = session ? findRoomByPlayer(session.playerId) : undefined;
    const player = room?.players.find((item) => item.playerId === session?.playerId);
    if (!session || !room || !player) return reply({ error: error('NOT_IN_ROOM', '你还不在房间内') });
    if (!ensureLobby(room)) return reply({ error: error('ROOM_LOCKED', '对局已经开始') });

    try {
      await realtime.withRoomLock(room.id, async () => {
        player.isReady = Boolean(payload.isReady);
        touchRoom(room);
        await persist();
        broadcastRoom(room);
        reply({ room: toRoomPayload(room) });
      });
    } catch {
      reply({ error: error('ROOM_BUSY', '房间操作繁忙，请稍后重试') });
    }
  });

  socket.on('room:start', async (_payload, reply) => {
    const session = requireSession(socket);
    const room = session ? findRoomByPlayer(session.playerId) : undefined;
    if (!session || !room) return reply({ error: error('NOT_IN_ROOM', '你还不在房间内') });
    if (!ensureHost(room, session.playerId)) return reply({ error: error('FORBIDDEN', '只有房主可以开始游戏') });
    if (!ensureLobby(room)) return reply({ error: error('ROOM_LOCKED', '对局已经开始') });
    if (room.players.length < 2) return reply({ error: error('NEED_PLAYERS', '至少需要 2 名玩家') });
    if (!room.players.every((player) => player.isReady)) return reply({ error: error('NOT_READY', '还有玩家未准备') });

    try {
      await realtime.withRoomLock(room.id, async () => {
        if (!ensureLobby(room)) return reply({ error: error('ROOM_LOCKED', '对局已经开始') });
        room.status = 'playing';
        room.gameState = createGame(room.players.map((player) => player.displayName));
        room.gameState.players = room.gameState.players.map((player, index) => ({
          ...player,
          id: room.players[index].playerId,
          name: room.players[index].displayName,
        }));
        touchRoom(room);
        await persist();
        broadcastRoom(room);
        reply({ room: toRoomPayload(room) });
      });
    } catch {
      reply({ error: error('ROOM_BUSY', '房间操作繁忙，请稍后重试') });
    }
  });

  socket.on('game:action', async (payload, reply) => {
    const session = requireSession(socket);
    const room = session ? findRoomByPlayer(session.playerId) : undefined;
    if (!session || !room) return reply({ error: error('NOT_IN_ROOM', '你还不在房间内') });
    if (room.status !== 'playing' || !room.gameState) return reply({ error: error('NOT_PLAYING', '对局尚未开始') });

    try {
      await realtime.withRoomLock(room.id, async () => {
        if (payload.actionId && room.processedActionIds.includes(payload.actionId)) {
          return reply({ room: toRoomPayload(room) });
        }

        const result = applyGameAction(room.gameState!, session.playerId, payload.action as GameAction);
        if (!result.ok) return reply({ error: error('INVALID_ACTION', result.error ?? '行动无效') });

        room.gameState = result.state;
        if (room.gameState.phase === 'gameOver') room.status = 'finished';
        if (payload.actionId) room.processedActionIds = [payload.actionId, ...room.processedActionIds].slice(0, 200);
        touchRoom(room);
        await persist();
        broadcastRoom(room);
        reply({ room: toRoomPayload(room) });
      });
    } catch {
      reply({ error: error('ROOM_BUSY', '房间操作繁忙，请稍后重试') });
    }
  });

  socket.on('room:restart', async (_payload, reply) => {
    const session = requireSession(socket);
    const room = session ? findRoomByPlayer(session.playerId) : undefined;
    if (!session || !room) return reply({ error: error('NOT_IN_ROOM', '你还不在房间内') });
    if (!ensureHost(room, session.playerId)) return reply({ error: error('FORBIDDEN', '只有房主可以再来一局') });

    try {
      await realtime.withRoomLock(room.id, async () => {
        room.status = 'lobby';
        room.gameState = undefined;
        room.processedActionIds = [];
        room.players = room.players.map((player, index) => ({
          ...player,
          seat: index + 1,
          isReady: player.playerId === room.hostPlayerId,
        }));
        touchRoom(room);
        await persist();
        broadcastRoom(room);
        reply({ room: toRoomPayload(room) });
      });
    } catch {
      reply({ error: error('ROOM_BUSY', '房间操作繁忙，请稍后重试') });
    }
  });

  socket.on('room:leave', async (_payload, reply) => {
    const session = requireSession(socket);
    const room = session ? findRoomByPlayer(session.playerId) : undefined;
    if (!session || !room) return reply({ ok: false, error: error('NOT_IN_ROOM', '你还不在房间内') });

    try {
      await realtime.withRoomLock(room.id, async () => {
        room.players = room.players.filter((player) => player.playerId !== session.playerId);
        if (room.players.length === 0) {
          room.status = 'closed';
          rooms.delete(room.id);
        } else if (room.hostPlayerId === session.playerId) {
          room.hostPlayerId = room.players[0].playerId;
          room.players = room.players.map((player, index) => ({
            ...player,
            seat: index + 1,
            isHost: player.playerId === room.hostPlayerId,
          }));
        }

        await socket.leave(room.id);
        touchRoom(room);
        await persist();
        broadcastRoom(room);
        reply({ ok: true });
      });
    } catch {
      reply({ ok: false, error: error('ROOM_BUSY', '房间操作繁忙，请稍后重试') });
    }
  });

  socket.on('disconnect', () => {
    const session = requireSession(socket);
    if (!session) return;
    session.socketId = undefined;
    session.lastSeenAt = now();
    void setPlayerConnection(session.playerId, 'reconnecting');

    const timer = setTimeout(() => {
      void setPlayerConnection(session.playerId, 'offline').then(async () => {
        const room = findRoomByPlayer(session.playerId);
        if (!room) return;
        await realtime.withRoomLock(room.id, async () => {
          const currentRoom = rooms.get(room.id);
          if (!currentRoom) return;
          closeRoomIfEmpty(currentRoom);
          await persist();
        });
      });
    }, reconnectGraceMs);
    reconnectTimers.set(session.playerId, timer);
  });
});

await loadPersistedData();
httpServer.listen(port, () => {
  console.log(
    `Property Merchant online server listening on http://localhost:${port} (${storage.driver} storage, ${realtime.driver} realtime)`,
  );
});

async function shutdown() {
  await realtime.close();
  await storage.close?.();
  httpServer.close();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
