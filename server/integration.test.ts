import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';

const port = 20_000 + Math.floor(Math.random() * 10_000);
const baseUrl = `http://localhost:${port}`;
const clientOrigin = 'http://localhost:5173';
let serverProcess: ChildProcessWithoutNullStreams;
let dataDirectory: string;
let serverOutput = '';

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`Test server exited early:\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for test server:\n${serverOutput}`);
}

async function openSession(displayName: string) {
  const response = await fetch(`${baseUrl}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: clientOrigin },
    body: JSON.stringify({ displayName }),
  });
  const body = (await response.json()) as { session: { playerId: string; displayName: string } };
  const setCookie = response.headers.get('set-cookie') ?? '';
  expect(response.ok).toBe(true);
  expect(setCookie).toContain('HttpOnly');
  expect(body.session).not.toHaveProperty('sessionToken');
  return { body, cookie: setCookie.split(';')[0] };
}

function connect(cookie: string) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { Cookie: cookie, Origin: clientOrigin },
      reconnection: false,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function expectConnectionError(cookie?: string, origin = clientOrigin) {
  return new Promise<string>((resolve, reject) => {
    const socket = io(baseUrl, {
      transports: ['websocket'],
      extraHeaders: { ...(cookie ? { Cookie: cookie } : {}), Origin: origin },
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Expected the connection to be rejected'));
    }, 3_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('Unexpected authenticated connection'));
    });
    socket.once('connect_error', (connectionError) => {
      clearTimeout(timer);
      socket.close();
      resolve(connectionError.message);
    });
  });
}

function emitAck<T>(socket: Socket, event: string, payload: unknown) {
  return new Promise<T>((resolve, reject) => {
    socket.timeout(3_000).emit(event, payload, (timeoutError: Error | null, response: T) => {
      if (timeoutError) reject(timeoutError);
      else resolve(response);
    });
  });
}

beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'property-merchant-integration-'));
  const tsxExecutable = join(process.cwd(), 'node_modules', '.bin', 'tsx');
  serverProcess = spawn(tsxExecutable, ['server/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      CLIENT_ORIGIN: clientOrigin,
      STORAGE_DRIVER: 'json',
      ROOM_DATA_FILE: join(dataDirectory, 'rooms.json'),
      COOKIE_SECURE: 'false',
      REDIS_URL: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer();
});

afterAll(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => serverProcess.once('exit', () => resolve()));
  }
  if (dataDirectory) await rm(dataDirectory, { recursive: true, force: true });
});

describe('secure online multiplayer server', () => {
  it('rejects unauthenticated clients and completes a two-player turn', async () => {
    await expect(expectConnectionError()).resolves.toBe('UNAUTHORIZED');

    const [firstSession, secondSession] = await Promise.all([openSession('测试甲'), openSession('测试乙')]);
    await expect(expectConnectionError(firstSession.cookie, 'https://malicious.example')).resolves.toBeTruthy();

    const [first, second] = await Promise.all([connect(firstSession.cookie), connect(secondSession.cookie)]);
    try {
      const firstRestore = await emitAck<{ session: { playerId: string } }>(first, 'session:restore', {
        displayName: '测试甲',
      });
      const secondRestore = await emitAck<{ session: { playerId: string } }>(second, 'session:restore', {
        displayName: '测试乙',
      });
      expect(firstRestore.session.playerId).toBe(firstSession.body.session.playerId);
      expect(secondRestore.session.playerId).toBe(secondSession.body.session.playerId);

      const created = await emitAck<{ room: { code: string } }>(first, 'room:create', { maxPlayers: 2 });
      const joined = await emitAck<{ room: { players: unknown[] } }>(second, 'room:join', { code: created.room.code });
      expect(joined.room.players).toHaveLength(2);

      await emitAck(second, 'room:ready', { isReady: true });
      const started = await emitAck<{ room: { status: string } }>(first, 'room:start', {});
      expect(started.room.status).toBe('playing');

      const acted = await emitAck<{ room: { gameState: { currentPlayerIndex: number } } }>(first, 'game:action', {
        actionId: 'integration-first-turn',
        action: { type: 'takeEnergies', energies: ['fire', 'water', 'earth'] },
      });
      expect(acted.room.gameState.currentPlayerIndex).toBe(1);
    } finally {
      first.close();
      second.close();
    }
  });
});
