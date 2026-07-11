import { describe, expect, it } from 'vitest';
import type { Badge } from './types';
import { createGame } from './setup';
import { canCapture, canClaimBadge, getEffectiveCost, getWinners, paymentFor } from './rules';
import { applyGameAction, canPassTurn } from './actions';

describe('核心规则', () => {
  it('按人数初始化能量与市场', () => {
    const game = createGame(['甲', '乙']);
    expect(game.energyPool.flame).toBe(4);
    expect(game.market[1]).toHaveLength(4);
    expect(game.availableBadges).toHaveLength(3);
    expect(game.decks[1]).toHaveLength(36);
    expect(game.decks[2]).toHaveLength(26);
    expect(game.decks[3]).toHaveLength(16);
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
    const firstCostType = Object.keys(cost).find((type) => cost[type as keyof typeof cost] > 0) as keyof typeof cost;
    player.energies[firstCostType] -= 1;
    player.energies.wild = 1;
    expect(canCapture(player, card)).toBe(true);
    const payment = paymentFor(player, card);
    expect(payment.wild).toBe(1);
    expect(payment[firstCostType]).toBe(cost[firstCostType] - 1);
  });

  it('徽章仅统计永久羁绊，不统计持有灵珠', () => {
    const game = createGame(['甲', '乙']);
    const player = game.players[0];
    const badge: Badge = { id: 'test-badge', name: '火之试炼', points: 3, requirement: { flame: 2 }, description: '测试' };
    player.energies.flame = 8;
    expect(canClaimBadge(player, badge)).toBe(false);
    player.capturedCards = [
      { ...game.market[1][0], id: 'fire-bond-1', element: 'flame' },
      { ...game.market[1][1], id: 'fire-bond-2', element: 'flame' },
    ];
    expect(canClaimBadge(player, badge)).toBe(true);
  });

  it('所有牌库和市集耗尽时启动最终轮', () => {
    const game = createGame(['甲', '乙']);
    const lastCard = { ...game.market[1][0], points: 0, cost: {} };
    game.decks = { 1: [], 2: [], 3: [] };
    game.market = { 1: [lastCard], 2: [], 3: [] };

    const result = applyGameAction(game, 'p1', { type: 'captureCard', cardId: lastCard.id, source: 'market' });
    expect(result.ok).toBe(true);
    expect(result.state.finalRoundTriggered).toBe(true);
    expect(result.state.log[0].message).toContain('完成本轮后结算');
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

  it('结算时累计局数和玩家胜场，并在下一局保留', () => {
    const game = createGame(['甲', '乙']);
    const winningCard = { ...game.market[1][0], points: 1, cost: {} };
    game.market[1] = [winningCard, ...game.market[1].slice(1)];
    game.finalRoundTriggered = true;
    game.targetTurns = 1;
    game.players[1].turns = 1;

    const result = applyGameAction(game, 'p1', { type: 'captureCard', cardId: winningCard.id, source: 'market' });
    expect(result.ok).toBe(true);
    expect(result.state.phase).toBe('gameOver');
    expect(result.state.matchStats.gamesPlayed).toBe(1);
    expect(result.state.matchStats.wins.p1).toBe(1);
    expect(result.state.matchStats.wins.p2).toBe(0);

    const nextGame = createGame(['甲', '乙'], result.state.matchStats, ['p1', 'p2']);
    expect(nextGame.matchStats).toEqual(result.state.matchStats);
    expect(nextGame.log[0].message).toContain('第 2 局开始');
  });

  it('仅在没有任何合法行动时允许跳过回合', () => {
    const game = createGame(['甲', '乙']);
    expect(canPassTurn(game, 'p1')).toBe(false);
    expect(applyGameAction(game, 'p1', { type: 'passTurn' }).ok).toBe(false);

    for (const energy of ['flame', 'aqua', 'leaf', 'spark', 'mind'] as const) game.energyPool[energy] = 0;
    game.market = { 1: [], 2: [], 3: [] };
    const expensiveCard = { ...game.decks[3][0], cost: { flame: 99 } };
    game.players[0].reservedCards = [0, 1, 2].map((index) => ({ ...expensiveCard, id: `blocked-${index}` }));

    expect(canPassTurn(game, 'p1')).toBe(true);
    const result = applyGameAction(game, 'p1', { type: 'passTurn' });
    expect(result.ok).toBe(true);
    expect(result.state.currentPlayerIndex).toBe(1);
    expect(result.state.log[0].message).toContain('跳过了回合');
  });
});
