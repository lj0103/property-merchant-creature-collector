import type { GameAction } from '../game/actions';
import type { GameState } from '../game/types';

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'closed';
export type ConnectionState = 'online' | 'reconnecting' | 'offline';

export interface SessionPayload {
  playerId: string;
  displayName: string;
}

export interface RoomPlayerPayload {
  playerId: string;
  displayName: string;
  seat: number;
  isHost: boolean;
  isReady: boolean;
  connectionState: ConnectionState;
}

export interface RoomPayload {
  id: string;
  code: string;
  hostPlayerId: string;
  status: RoomStatus;
  maxPlayers: 2 | 3 | 4 | 5;
  players: RoomPlayerPayload[];
  gameState?: GameState;
  createdAt: string;
  updatedAt: string;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
}

export interface ClientToServerEvents {
  'session:restore': (
    payload: { displayName?: string },
    reply: (response: { session?: SessionPayload; room?: RoomPayload; error?: ServerErrorPayload }) => void,
  ) => void;
  'room:create': (payload: { maxPlayers: 2 | 3 | 4 | 5 }, reply: (response: { room?: RoomPayload; error?: ServerErrorPayload }) => void) => void;
  'room:join': (payload: { code: string }, reply: (response: { room?: RoomPayload; error?: ServerErrorPayload }) => void) => void;
  'room:ready': (payload: { isReady: boolean }, reply: (response: { room?: RoomPayload; error?: ServerErrorPayload }) => void) => void;
  'room:start': (_payload: Record<string, never>, reply: (response: { room?: RoomPayload; error?: ServerErrorPayload }) => void) => void;
  'room:leave': (_payload: Record<string, never>, reply: (response: { ok: boolean; error?: ServerErrorPayload }) => void) => void;
  'room:restart': (_payload: Record<string, never>, reply: (response: { room?: RoomPayload; error?: ServerErrorPayload }) => void) => void;
  'game:action': (payload: { action: GameAction; actionId?: string }, reply: (response: { room?: RoomPayload; error?: ServerErrorPayload }) => void) => void;
}

export interface ServerToClientEvents {
  'room:update': (room: RoomPayload) => void;
  'room:closed': (payload: { message: string }) => void;
  'server:error': (error: ServerErrorPayload) => void;
}
