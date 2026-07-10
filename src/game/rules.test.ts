import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { canCapture, getEffectiveCost, getWinners } from './rules';

describe('核心规则', () => {
  it('按人数初始化能量与市场', () => {
    const game = createGame(['甲', '乙']);
    expect(game.energyPool.flame).toBe(4);
    expect(game.market[1]).toHaveLength(4);
    expect(game.availableBadges).toHaveLength(3);
  });

  it('为五人对局初始化足够的能量与徽章', () => {
    const game = createGame(['甲', '乙', '丙', '丁', '戊']);
    expect(game.players).toHaveLength(5);
    expect(game.energyPool.flame).toBe(8);
    expect(game.energyPool.wild).toBe(5);
    expect(game.availableBadges).toHaveLength(6);
  });

  it('折扣与万能能量参与支付判断', () => {
    const game = createGame(['甲', '乙']);
    const player = game.players[0];
    const card = game.market[1][0];
    player.capturedCards = [{ ...card, id: 'bonus', element: 'flame' }];
    const cost = getEffectiveCost(player, card);
    Object.entries(cost).forEach(([type, count]) => {
      player.energies[type as keyof typeof player.energies] = count;
    });
    expect(canCapture(player, card)).toBe(true);
  });

  it('平分时卡少者胜', () => {
    const game = createGame(['甲', '乙']);
    game.players[0].capturedCards = [
      { ...game.market[1][0], points: 1 },
      { ...game.market[1][1], points: 0 },
    ];
    game.players[1].capturedCards = [{ ...game.market[1][2], points: 1 }];
    expect(getWinners(game.players)).toEqual(['p2']);
  });
});
