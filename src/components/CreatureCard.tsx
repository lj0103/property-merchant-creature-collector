import type { CreatureCard as CardType, Phase, Player } from '../game/types';
import { ENERGY_LABELS } from '../data/constants';
import { canCapture, getEffectiveCost } from '../game/rules';
import { useGameStore } from '../store/gameStore';
import { GemIcon } from './GemDisplay';

interface CreatureCardProps {
  card: CardType;
  player: Player;
  source?: 'market' | 'reserved';
  phase?: Phase;
  disabled?: boolean;
  onCapture?: (id: string, source: 'market' | 'reserved') => void;
  onReserve?: (id: string) => void;
}

export function CreatureCard({
  card,
  player,
  source = 'market',
  phase: phaseOverride,
  disabled = false,
  onCapture,
  onReserve,
}: CreatureCardProps) {
  const localCapture = useGameStore((state) => state.captureCard);
  const localReserve = useGameStore((state) => state.reserveCard);
  const localPhase = useGameStore((state) => state.phase);
  const capture = onCapture ?? localCapture;
  const reserve = onReserve ?? localReserve;
  const phase = phaseOverride ?? localPhase;
  const cost = getEffectiveCost(player, card);
  const able = !disabled && canCapture(player, card) && phase === 'playing';

  return (
    <article className={`creature element-${card.element} ${able ? 'affordable' : ''}`}>
      <div className="card-top">
        <span className="level">阶位 {'◆'.repeat(card.level)}</span>
        <span className="points">{card.points}<small> 声望</small></span>
      </div>
      <div className="creature-art">
        <GemIcon type={card.element} size="card"/>
        <small>获得 {ENERGY_LABELS[card.element]}系永久羁绊</small>
      </div>
      <h3>{card.name}</h3>
      <p className="flavor">「{card.description}」</p>
      <div className="cost-label">所需灵珠</div>
      <div className="costs">
        {Object.entries(cost).filter(([, count]) => count > 0).map(([type, count]) => <GemIcon type={type as keyof typeof cost} count={count} size="cost" key={type}/>)}
        {Object.values(cost).every((count) => count === 0) && <span className="free">无需灵珠</span>}
      </div>
      <div className="card-actions">
        <button className="capture" disabled={!able} onClick={() => confirm(`是否捕捉「${card.name}」？`) && capture(card.id, source)}>{able ? '缔结契约' : '灵珠不足'}</button>
        {source === 'market' && <button className="reserve" disabled={disabled || phase !== 'playing' || player.reservedCards.length >= 3} onClick={() => confirm(`是否预定「${card.name}」？`) && reserve(card.id)}>预定</button>}
      </div>
    </article>
  );
}
