import { createAdapter } from '@socket.io/redis-adapter';
import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';
import type { Server } from 'socket.io';

type RedisClient = RedisClientType<any, any, any, any, any>;

export interface RealtimeCoordinator {
  readonly driver: 'memory' | 'redis';
  withRoomLock<T>(roomId: string, operation: () => Promise<T>): Promise<T>;
  setPlayerPresence(playerId: string, state: 'online' | 'reconnecting' | 'offline'): Promise<void>;
  close(): Promise<void>;
}

const lockTtlMs = Number(process.env.REDIS_LOCK_TTL_MS ?? 5_000);
const presenceTtlSeconds = Number(process.env.REDIS_PRESENCE_TTL_SECONDS ?? 120);

class MemoryCoordinator implements RealtimeCoordinator {
  readonly driver = 'memory' as const;
  private readonly roomQueues = new Map<string, Promise<void>>();

  async withRoomLock<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.roomQueues.get(roomId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.roomQueues.set(roomId, queued);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.roomQueues.get(roomId) === queued) this.roomQueues.delete(roomId);
    }
  }

  async setPlayerPresence() {}

  async close() {}
}

class RedisCoordinator implements RealtimeCoordinator {
  readonly driver = 'redis' as const;

  constructor(
    private readonly commandClient: RedisClient,
    private readonly pubClient: RedisClient,
    private readonly subClient: RedisClient,
  ) {}

  async withRoomLock<T>(roomId: string, operation: () => Promise<T>): Promise<T> {
    const key = `property-merchant:lock:room:${roomId}`;
    const token = randomUUID();
    const deadline = Date.now() + lockTtlMs;

    while (Date.now() < deadline) {
      const acquired = await this.commandClient.set(key, token, { NX: true, PX: lockTtlMs });
      if (acquired === 'OK') {
        try {
          return await operation();
        } finally {
          await this.commandClient.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            { keys: [key], arguments: [token] },
          );
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error('ROOM_LOCK_TIMEOUT');
  }

  async setPlayerPresence(playerId: string, state: 'online' | 'reconnecting' | 'offline') {
    const key = `property-merchant:presence:${playerId}`;
    if (state === 'offline') {
      await this.commandClient.del(key);
      return;
    }
    await this.commandClient.set(key, state, { EX: presenceTtlSeconds });
  }

  async close() {
    await Promise.allSettled([
      this.commandClient.quit(),
      this.pubClient.quit(),
      this.subClient.quit(),
    ]);
  }
}

export async function createRealtimeCoordinator(io: Server): Promise<RealtimeCoordinator> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return new MemoryCoordinator();

  const commandClient = createClient({
    url: redisUrl,
    socket: { connectTimeout: 2_000, reconnectStrategy: false },
  });
  const pubClient = commandClient.duplicate();
  const subClient = commandClient.duplicate();
  commandClient.on('error', () => undefined);
  pubClient.on('error', () => undefined);
  subClient.on('error', () => undefined);

  try {
    await Promise.all([commandClient.connect(), pubClient.connect(), subClient.connect()]);
    io.adapter(
      createAdapter(
        pubClient as unknown as Parameters<typeof createAdapter>[0],
        subClient as unknown as Parameters<typeof createAdapter>[1],
      ),
    );
    return new RedisCoordinator(commandClient, pubClient, subClient);
  } catch (cause) {
    console.warn('Redis unavailable; falling back to in-memory realtime coordination.', cause);
    await Promise.allSettled([commandClient.disconnect(), pubClient.disconnect(), subClient.disconnect()]);
    return new MemoryCoordinator();
  }
}
