import { BADGES } from '../data/badges';
import { CREATURE_CARDS } from '../data/cards';
import { EMPTY_ENERGIES, POOL_BY_PLAYERS } from '../data/constants';
import type { CreatureCard, GameState, Level, MatchStats, Player } from './types';

export const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

export function createGame(names: string[], previousStats?: MatchStats, playerIds?: string[]): GameState {
  const players: Player[] = names.map((name, index) => ({
    id: playerIds?.[index] ?? `p${index + 1}`,
    name: name.trim() || `玩家 ${index + 1}`,
    energies: EMPTY_ENERGIES(),
    capturedCards: [],
    reservedCards: [],
    badges: [],
    turns: 0,
  }));
  const decks = {} as Record<Level, CreatureCard[]>;
  const market = {} as Record<Level, CreatureCard[]>;
  for (const level of [1, 2, 3] as Level[]) {
    const deck = shuffle(CREATURE_CARDS.filter((card) => card.level === level));
    market[level] = deck.splice(0, 4);
    decks[level] = deck;
  }
  const poolSize = POOL_BY_PLAYERS[names.length];
  const wins = Object.fromEntries(players.map((player) => [player.id, previousStats?.wins[player.id] ?? 0]));
  return {
    players,
    currentPlayerIndex: 0,
    energyPool: { flame: poolSize, aqua: poolSize, leaf: poolSize, spark: poolSize, mind: poolSize, wild: 5 },
    decks,
    market,
    availableBadges: shuffle(BADGES).slice(0, names.length + 1),
    phase: 'playing',
    finalRoundTriggered: false,
    winnerIds: [],
    matchStats: { gamesPlayed: previousStats?.gamesPlayed ?? 0, wins },
    log: [{ id: crypto.randomUUID(), message: `第 ${(previousStats?.gamesPlayed ?? 0) + 1} 局开始，${players[0].name} 先行动。` }],
  };
}
