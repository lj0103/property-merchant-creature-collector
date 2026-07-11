import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Player } from '../game/types';
import { PlayerGemSummary } from './GemDisplay';

const players: Player[] = [
  {
    id: 'player-1',
    name: '玩家 1',
    energies: { flame: 2, aqua: 0, leaf: 1, spark: 0, mind: 0, wild: 1 },
    capturedCards: [],
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
  it('按玩家汇总当前持有的非零宝石数量', () => {
    const html = renderToStaticMarkup(<PlayerGemSummary players={players} currentPlayerId="player-1"/>);

    expect(html).toContain('各玩家当前持有宝石汇总');
    expect(html).toContain('玩家 1');
    expect(html).toContain('焰宝石 × 2');
    expect(html).toContain('森宝石 × 1');
    expect(html).toContain('万能宝石 × 1');
    expect(html).toContain('玩家 2');
    expect(html).toContain('暂无宝石');
    expect(html).not.toContain('潮宝石 × 0');
  });
});
