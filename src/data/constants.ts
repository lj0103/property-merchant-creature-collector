import type { EnergyMap, TokenType } from '../game/types';
export const ENERGY_LABELS: Record<TokenType, string> = { flame: '焰', aqua: '潮', leaf: '森', spark: '雷', mind: '念', wild: '灵' };
export const ENERGY_ICONS: Record<TokenType, string> = { flame: '✦', aqua: '◉', leaf: '❧', spark: 'ϟ', mind: '◇', wild: '✺' };
export const EMPTY_ENERGIES = (): EnergyMap => ({ flame: 0, aqua: 0, leaf: 0, spark: 0, mind: 0, wild: 0 });
export const POOL_BY_PLAYERS: Record<number, number> = { 2: 4, 3: 5, 4: 7, 5: 8 };
export const SCORE_TARGET = 15;
