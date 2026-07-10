import { Prisma, PrismaClient } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState } from '../src/game/types';
import type { RoomPlayerPayload, RoomStatus, SessionPayload } from '../src/multiplayer/protocol';

export interface SessionRecord extends SessionPayload {
  sessionToken: string;
  socketId?: string;
  lastSeenAt: string;
}

export interface RoomRecord {
  id: string;
  code: string;
  hostPlayerId: string;
  status: RoomStatus;
  maxPlayers: 2 | 3 | 4;
  players: RoomPlayerPayload[];
  gameState?: GameState;
  createdAt: string;
  updatedAt: string;
  processedActionIds: string[];
}

export interface PersistedData {
  sessions: SessionRecord[];
  rooms: RoomRecord[];
}

export interface RoomStorage {
  readonly driver: 'json' | 'prisma';
  load(): Promise<PersistedData>;
  save(data: PersistedData): Promise<void>;
  findSession(sessionToken: string): Promise<SessionRecord | undefined>;
  saveSession(session: SessionRecord): Promise<void>;
  close?(): Promise<void>;
}

const defaultDataFile = join(dirname(fileURLToPath(import.meta.url)), 'data', 'rooms.json');
const toPrismaJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export class JsonRoomStorage implements RoomStorage {
  readonly driver = 'json' as const;

  constructor(private readonly dataFile = process.env.ROOM_DATA_FILE ?? defaultDataFile) {}

  async load(): Promise<PersistedData> {
    try {
      const raw = await readFile(this.dataFile, 'utf8');
      return JSON.parse(raw) as PersistedData;
    } catch {
      const empty: PersistedData = { sessions: [], rooms: [] };
      await this.save(empty);
      return empty;
    }
  }

  async save(data: PersistedData): Promise<void> {
    await mkdir(dirname(this.dataFile), { recursive: true });
    await writeFile(this.dataFile, JSON.stringify(data, null, 2));
  }

  async findSession(sessionToken: string) {
    const data = await this.load();
    return data.sessions.find((session) => session.sessionToken === sessionToken);
  }

  async saveSession(session: SessionRecord) {
    const data = await this.load();
    data.sessions = [session, ...data.sessions.filter((item) => item.sessionToken !== session.sessionToken)];
    await this.save(data);
  }
}

export class PrismaRoomStorage implements RoomStorage {
  readonly driver = 'prisma' as const;
  private readonly prisma = new PrismaClient();

  async load(): Promise<PersistedData> {
    const [sessions, rooms] = await Promise.all([
      this.prisma.guestSession.findMany(),
      this.prisma.room.findMany({ where: { status: { not: 'closed' } } }),
    ]);

    return {
      sessions: sessions.map((session) => ({
        playerId: session.playerId,
        displayName: session.displayName,
        sessionToken: session.sessionToken,
        socketId: session.socketId ?? undefined,
        lastSeenAt: session.lastSeenAt.toISOString(),
      })),
      rooms: rooms.map((room) => ({
        id: room.id,
        code: room.code,
        hostPlayerId: room.hostPlayerId,
        status: room.status as RoomStatus,
        maxPlayers: room.maxPlayers as 2 | 3 | 4,
        players: room.players as unknown as RoomPlayerPayload[],
        gameState: room.gameState as unknown as GameState | undefined,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
        processedActionIds: room.processedActionIds as unknown as string[],
      })),
    };
  }

  async save(data: PersistedData): Promise<void> {
    const activeRooms = data.rooms.filter((room) => room.status !== 'closed');

    await this.prisma.$transaction([
      ...data.sessions.map((session) =>
        this.prisma.guestSession.upsert({
          where: { sessionToken: session.sessionToken },
          create: {
            sessionToken: session.sessionToken,
            playerId: session.playerId,
            displayName: session.displayName,
            socketId: session.socketId,
            lastSeenAt: new Date(session.lastSeenAt),
          },
          update: {
            playerId: session.playerId,
            displayName: session.displayName,
            socketId: session.socketId,
            lastSeenAt: new Date(session.lastSeenAt),
          },
        }),
      ),
      this.prisma.room.deleteMany({
        where: activeRooms.length ? { id: { notIn: activeRooms.map((room) => room.id) } } : {},
      }),
      ...activeRooms.map((room) =>
        this.prisma.room.upsert({
          where: { id: room.id },
          create: {
            id: room.id,
            code: room.code,
            hostPlayerId: room.hostPlayerId,
            status: room.status,
            maxPlayers: room.maxPlayers,
            players: toPrismaJson(room.players),
            gameState: room.gameState ? toPrismaJson(room.gameState) : Prisma.JsonNull,
            processedActionIds: toPrismaJson(room.processedActionIds),
            createdAt: new Date(room.createdAt),
            updatedAt: new Date(room.updatedAt),
          },
          update: {
            code: room.code,
            hostPlayerId: room.hostPlayerId,
            status: room.status,
            maxPlayers: room.maxPlayers,
            players: toPrismaJson(room.players),
            gameState: room.gameState ? toPrismaJson(room.gameState) : Prisma.JsonNull,
            processedActionIds: toPrismaJson(room.processedActionIds),
            updatedAt: new Date(room.updatedAt),
          },
        }),
      ),
    ]);
  }

  async findSession(sessionToken: string) {
    const session = await this.prisma.guestSession.findUnique({ where: { sessionToken } });
    if (!session) return undefined;
    return {
      playerId: session.playerId,
      displayName: session.displayName,
      sessionToken: session.sessionToken,
      socketId: session.socketId ?? undefined,
      lastSeenAt: session.lastSeenAt.toISOString(),
    };
  }

  async saveSession(session: SessionRecord) {
    await this.prisma.guestSession.upsert({
      where: { sessionToken: session.sessionToken },
      create: {
        sessionToken: session.sessionToken,
        playerId: session.playerId,
        displayName: session.displayName,
        socketId: session.socketId,
        lastSeenAt: new Date(session.lastSeenAt),
      },
      update: {
        playerId: session.playerId,
        displayName: session.displayName,
        socketId: session.socketId,
        lastSeenAt: new Date(session.lastSeenAt),
      },
    });
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export function createRoomStorage(): RoomStorage {
  if (process.env.DATABASE_URL && process.env.STORAGE_DRIVER !== 'json') return new PrismaRoomStorage();
  return new JsonRoomStorage();
}
