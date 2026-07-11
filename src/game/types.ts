export const ENERGY_TYPES = ['flame', 'aqua', 'leaf', 'spark', 'mind'] as const;
export type EnergyType = (typeof ENERGY_TYPES)[number];
export type TokenType = EnergyType | 'wild';
export type EnergyMap = Record<TokenType, number>;
export type Level = 1 | 2 | 3;

export interface CreatureCard { id: string; name: string; level: Level; element: EnergyType; points: number; cost: Partial<Record<EnergyType, number>>; description: string }
export interface Badge { id: string; name: string; points: number; requirement: Partial<Record<EnergyType, number>>; description: string }
export interface Player { id: string; name: string; energies: EnergyMap; capturedCards: CreatureCard[]; reservedCards: CreatureCard[]; badges: Badge[]; turns: number }
export type Market = Record<Level, CreatureCard[]>;
export type Decks = Record<Level, CreatureCard[]>;
export type Phase = 'setup' | 'playing' | 'discarding' | 'gameOver';
export interface LogEntry { id: string; message: string }
export interface MatchStats { gamesPlayed: number; wins: Record<string, number> }
export interface GameState { players: Player[]; currentPlayerIndex: number; energyPool: EnergyMap; decks: Decks; market: Market; availableBadges: Badge[]; phase: Phase; finalRoundTriggered: boolean; targetTurns?: number; winnerIds: string[]; matchStats: MatchStats; log: LogEntry[]; notice?: string }
