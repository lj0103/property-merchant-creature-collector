import type { EnergyMap, TokenType } from '../game/types';
export const ENERGY_LABELS: Record<TokenType, string> = { flame: '火', aqua: '水', leaf: '木', spark: '金', mind: '土', wild: '灵' };
export const ENERGY_ICONS: Record<TokenType, string> = { flame: '火', aqua: '水', leaf: '木', spark: '金', mind: '土', wild: '灵' };
export const ORB_LABELS: Record<TokenType, string> = { flame: '火灵珠', aqua: '水灵珠', leaf: '木灵珠', spark: '金灵珠', mind: '土灵珠', wild: '灵珠' };
export const EMPTY_ENERGIES = (): EnergyMap => ({ flame: 0, aqua: 0, leaf: 0, spark: 0, mind: 0, wild: 0 });
export const POOL_BY_PLAYERS: Record<number, number> = { 2: 4, 3: 5, 4: 7, 5: 8 };
export const SCORE_TARGET = 15;
