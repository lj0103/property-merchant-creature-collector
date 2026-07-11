import { ORB_LABELS, SCORE_TARGET } from '../data/constants';
import {
  ENERGY_TYPES,
  type EnergyType,
  type GameState,
  type Level,
  type TokenType,
} from './types';
import { canCapture, canClaimBadge, getScore, getWinners, paymentFor, tokenCount } from './rules';

export type GameAction =
  | { type: 'takeEnergies'; energies: EnergyType[] }
  | { type: 'reserveCard'; cardId: string }
  | { type: 'captureCard'; cardId: string; source: 'market' | 'reserved' }
  | { type: 'discardEnergy'; energy: TokenType }
  | { type: 'passTurn' };

export interface ActionResult {
  ok: boolean;
  state: GameState;
  error?: string;
}

export const cloneGameState = (state: GameState): GameState => ({
  ...state,
  players: structuredClone(state.players),
  energyPool: { ...state.energyPool },
  decks: structuredClone(state.decks),
  market: structuredClone(state.market),
  availableBadges: structuredClone(state.availableBadges),
  winnerIds: [...state.winnerIds],
  log: structuredClone(state.log),
});

const newLogId = () =>
  globalThis.crypto?.randomUUID?.() ?? `log-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const addLog = (state: GameState, message: string) =>
  [{ id: newLogId(), message }, ...state.log].slice(0, 30);

const refill = (state: GameState, level: Level) => {
  const next = state.decks[level][0];
  state.decks[level] = state.decks[level].slice(1);
  if (next) state.market[level].push(next);
};

const finishAction = (state: GameState): GameState => {
  const player = state.players[state.currentPlayerIndex];

  if (tokenCount(player) > 10) {
    return {
      ...state,
      phase: 'discarding',
      notice: `请归还 ${tokenCount(player) - 10} 枚灵珠。`,
    };
  }

  player.turns += 1;

  if (!state.finalRoundTriggered && getScore(player) >= SCORE_TARGET) {
    state.finalRoundTriggered = true;
    state.targetTurns = Math.max(...state.players.map((p) => p.turns));
    state.log = addLog(state, `${player.name} 达到 ${SCORE_TARGET} 分，最终轮开始！`);
  }

  if (state.finalRoundTriggered && state.players.every((p) => p.turns >= (state.targetTurns ?? 0))) {
    return {
      ...state,
      phase: 'gameOver',
      winnerIds: getWinners(state.players),
      notice: '对局结束',
    };
  }

  return {
    ...state,
    currentPlayerIndex: (state.currentPlayerIndex + 1) % state.players.length,
    phase: 'playing',
    notice: undefined,
  };
};

const reject = (state: GameState, error: string): ActionResult => ({ ok: false, state, error });
const accept = (state: GameState): ActionResult => ({ ok: true, state });

export function hasLegalAction(state: GameState, playerId: string) {
  const player = state.players[state.currentPlayerIndex];
  if (!player || player.id !== playerId || state.phase !== 'playing') return false;

  const availableColors = ENERGY_TYPES.filter((energy) => state.energyPool[energy] > 0).length;
  const canTakeGems = availableColors >= 3 || ENERGY_TYPES.some((energy) => state.energyPool[energy] >= 4);
  const marketCards = ([1, 2, 3] as Level[]).flatMap((level) => state.market[level]);
  const canReserve = player.reservedCards.length < 3 && marketCards.length > 0;
  const canBuy = [...marketCards, ...player.reservedCards].some((card) => canCapture(player, card));
  return canTakeGems || canReserve || canBuy;
}

export function canPassTurn(state: GameState, playerId: string) {
  const player = state.players[state.currentPlayerIndex];
  return Boolean(player && player.id === playerId && state.phase === 'playing' && !hasLegalAction(state, playerId));
}

export function applyGameAction(currentState: GameState, playerId: string, action: GameAction): ActionResult {
  const state = cloneGameState(currentState);
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (!currentPlayer) return reject(state, '对局尚未开始');
  if (currentPlayer.id !== playerId) return reject(state, '还没有轮到你行动');
  if (state.phase === 'gameOver') return reject(state, '对局已经结束');

  if (action.type === 'discardEnergy') {
    if (state.phase !== 'discarding') return reject(state, '当前无需归还灵珠');
    if (currentPlayer.energies[action.energy] < 1) return reject(state, '没有这种灵珠可归还');

    currentPlayer.energies[action.energy] -= 1;
    state.energyPool[action.energy] += 1;
    state.log = addLog(state, `${currentPlayer.name} 归还了 1 枚${ORB_LABELS[action.energy]}。`);

    if (tokenCount(currentPlayer) <= 10) return accept(finishAction(state));
    return accept({ ...state, notice: `请再归还 ${tokenCount(currentPlayer) - 10} 枚灵珠。` });
  }

  if (state.phase !== 'playing') return reject(state, '当前不能执行这个行动');

  if (action.type === 'passTurn') {
    if (!canPassTurn(state, playerId)) return reject(state, '仍有可执行的行动，不能跳过回合');
    state.log = addLog(state, `${currentPlayer.name} 当前无可执行行动，跳过了回合。`);
    return accept(finishAction(state));
  }

  if (action.type === 'takeEnergies') {
    const unique = new Set(action.energies);
    const different = action.energies.length === 3 && unique.size === 3;
    const same = action.energies.length === 2 && unique.size === 1;

    if (!different && !same) return reject(state, '请选择 3 种不同灵珠，或同种灵珠 2 枚');
    if (action.energies.some((energy) => state.energyPool[energy] < 1)) return reject(state, '公共池中灵珠不足');
    if (same && state.energyPool[action.energies[0]] < 4) return reject(state, '拿取 2 枚时，公共池至少要有 4 枚');

    action.energies.forEach((energy) => {
      state.energyPool[energy] -= 1;
      currentPlayer.energies[energy] += 1;
    });
    state.log = addLog(
      state,
      `${currentPlayer.name} 获取了 ${action.energies.map((energy) => ORB_LABELS[energy]).join('、')}。`,
    );
    return accept(finishAction(state));
  }

  if (action.type === 'reserveCard') {
    if (currentPlayer.reservedCards.length >= 3) return reject(state, '最多只能预定 3 张精灵卡');

    let level: Level | undefined;
    for (const candidate of [1, 2, 3] as Level[]) {
      if (state.market[candidate].some((card) => card.id === action.cardId)) level = candidate;
    }
    if (!level) return reject(state, '卡牌已不在市场');

    const card = state.market[level].find((item) => item.id === action.cardId)!;
    state.market[level] = state.market[level].filter((item) => item.id !== action.cardId);
    currentPlayer.reservedCards.push(card);
    refill(state, level);

    let wildMessage = '';
    if (state.energyPool.wild > 0) {
      state.energyPool.wild -= 1;
      currentPlayer.energies.wild += 1;
      wildMessage = '，并获得 1 枚万能灵珠';
    }

    state.log = addLog(state, `${currentPlayer.name} 预定了「${card.name}」${wildMessage}。`);
    return accept(finishAction(state));
  }

  if (action.type === 'captureCard') {
    let level: Level | undefined;
    let card = undefined;

    if (action.source === 'reserved') {
      card = currentPlayer.reservedCards.find((item) => item.id === action.cardId);
    } else {
      for (const candidate of [1, 2, 3] as Level[]) {
        const found = state.market[candidate].find((item) => item.id === action.cardId);
        if (found) {
          card = found;
          level = candidate;
          break;
        }
      }
    }

    if (!card) return reject(state, '找不到这张卡');
    if (!canCapture(currentPlayer, card)) return reject(state, '灵珠不足，暂时无法捕捉');

    const payment = paymentFor(currentPlayer, card);
    for (const token of [...ENERGY_TYPES, 'wild'] as TokenType[]) {
      currentPlayer.energies[token] -= payment[token];
      state.energyPool[token] += payment[token];
    }

    currentPlayer.capturedCards.push(card);
    if (action.source === 'reserved') {
      currentPlayer.reservedCards = currentPlayer.reservedCards.filter((item) => item.id !== action.cardId);
    } else if (level) {
      state.market[level] = state.market[level].filter((item) => item.id !== action.cardId);
      refill(state, level);
    }

    const claimedBadges = state.availableBadges.filter((badge) => canClaimBadge(currentPlayer, badge));
    currentPlayer.badges.push(...claimedBadges);
    state.availableBadges = state.availableBadges.filter((badge) => !claimedBadges.includes(badge));
    state.log = addLog(
      state,
      `${currentPlayer.name} 捕捉了「${card.name}」${
        claimedBadges.length ? `，并获得 ${claimedBadges.map((badge) => `「${badge.name}」`).join('、')}` : ''
      }。`,
    );

    return accept(finishAction(state));
  }

  return reject(state, '未知行动');
}
