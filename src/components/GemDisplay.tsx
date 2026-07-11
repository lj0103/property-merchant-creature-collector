import { ENERGY_ICONS, ORB_LABELS } from '../data/constants';
import { ENERGY_TYPES, type EnergyType, type Player, type TokenType } from '../game/types';
import { getDiscounts } from '../game/rules';

const TOKEN_TYPES: TokenType[] = [...ENERGY_TYPES, 'wild'];
type GemSize = 'small' | 'inline' | 'summary' | 'cost' | 'card';

export function GemIcon({ type, count, size = 'small' }: { type: TokenType; count?: number; size?: GemSize }) {
  const label = `${ORB_LABELS[type]}${count === undefined ? '' : ` × ${count}`}`;
  return <span className={`gem-icon gem-${size} ${type}`} title={label} aria-label={label}><i>{ENERGY_ICONS[type]}</i>{count !== undefined && <b>{count}</b>}</span>;
}

export function GemRequirements({ requirement }: { requirement: Partial<Record<EnergyType, number>> }) {
  return <div className="badge-requirements" aria-label="徽章所需灵珠">{Object.entries(requirement).map(([type, count]) => <GemIcon type={type as EnergyType} count={count} key={type}/>)}</div>;
}

export function PlayerGemSummary({ players, currentPlayerId }: { players: Player[]; currentPlayerId?: string }) {
  return (
    <div className="player-gem-summary" aria-label="各玩家持有灵珠与永久羁绊汇总">
      {players.map((player) => {
        const gems = TOKEN_TYPES.filter((type) => player.energies[type] > 0);
        const discounts = getDiscounts(player);
        const bonds = ENERGY_TYPES.filter((type) => discounts[type] > 0);
        return (
          <div className={`player-gem-row ${player.id === currentPlayerId ? 'current' : ''}`} key={player.id}>
            <strong title={player.name}>{player.name}</strong>
            <div className="player-resource-lines">
              <div className="player-resource-line" title="持有灵珠会在捕捉精灵时消耗">
                <span className="resource-key held">持</span>
                <div className="player-gem-counts">{gems.length > 0 ? gems.map((type) => <GemIcon type={type} count={player.energies[type]} size="summary" key={type}/>) : <small>—</small>}</div>
              </div>
              <div className="player-resource-line" title="永久羁绊来自已捕捉的精灵，提供永久折扣且不会消耗">
                <span className="resource-key bond">绊</span>
                <div className="player-gem-counts">{bonds.length > 0 ? bonds.map((type) => <GemIcon type={type} count={discounts[type]} size="summary" key={type}/>) : <small>—</small>}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
