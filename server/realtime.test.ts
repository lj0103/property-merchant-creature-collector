import type { Server } from 'socket.io';
import { afterEach, describe, expect, it } from 'vitest';
import { createRealtimeCoordinator } from './realtime';

const originalRedisUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalRedisUrl;
});

describe('memory realtime coordinator', () => {
  it('serializes operations for the same room', async () => {
    delete process.env.REDIS_URL;
    const coordinator = await createRealtimeCoordinator({} as Server);
    let activeOperations = 0;
    let maxActiveOperations = 0;

    const operation = () =>
      coordinator.withRoomLock('room-1', async () => {
        activeOperations += 1;
        maxActiveOperations = Math.max(maxActiveOperations, activeOperations);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeOperations -= 1;
      });

    await Promise.all([operation(), operation(), operation()]);

    expect(coordinator.driver).toBe('memory');
    expect(maxActiveOperations).toBe(1);
    await coordinator.close();
  });
});
