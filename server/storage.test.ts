import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JsonRoomStorage, type SessionRecord } from './storage';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('JSON session storage', () => {
  it('saves and retrieves a shared session by token', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'property-merchant-session-'));
    temporaryDirectories.push(directory);
    const storage = new JsonRoomStorage(join(directory, 'rooms.json'));
    const session: SessionRecord = {
      playerId: 'player-1',
      displayName: '旅人',
      sessionToken: 'secret-token',
      lastSeenAt: new Date().toISOString(),
    };

    await storage.saveSession(session);

    await expect(storage.findSession(session.sessionToken)).resolves.toEqual(session);
    await expect(storage.findSession('missing-token')).resolves.toBeUndefined();
  });
});
