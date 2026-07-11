import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Player } from '../game/types';
import { PlayerGemSummary } from './GemDisplay';

const players: Player[] = [
  {
    id: 'player-1',
    name: '玩家 1',
    energies: { flame: 2, aqua: 0, leaf: 1, spark: 0, mind: 0, wild: 1 },
    capturedCards: [{ id: 'fire-card', name: '火灵', level: 1, element: 'flame', points: 0, cost: {}, description: '测试羁绊' }],
    reservedCards: [],
    badges: [],
    turns: 1,
  },
  {
    id: 'player-2',
    name: '玩家 2',
    energies: { flame: 0, aqua: 0, leaf: 0, spark: 0, mind: 0, wild: 0 },
    capturedCards: [],
    reservedCards: [],
    badges: [],
    turns: 0,
  },
];

describe('PlayerGemSummary', () => {
  it('按玩家区分汇总持有灵珠和永久羁绊', () => {
    const html = renderToStaticMarkup(<PlayerGemSummary players={players} currentPlayerId="player-1"/>);

    expect(html).toContain('各玩家持有灵珠与永久羁绊汇总');
    expect(html).toContain('玩家 1');
    expect(html).toContain('持有灵珠会在捕捉精灵时消耗');
    expect(html).toContain('永久羁绊来自已捕捉的精灵');
    expect(html).toContain('火灵珠 × 2');
    expect(html).toContain('火灵珠 × 1');
    expect(html).toContain('木灵珠 × 1');
    expect(html).toContain('灵珠 × 1');
    expect(html).toContain('玩家 2');
    expect(html).not.toContain('水灵珠 × 0');
  });
});
