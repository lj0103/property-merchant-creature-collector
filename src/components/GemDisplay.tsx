import { ENERGY_ICONS, ENERGY_LABELS } from '../data/constants';
import { ENERGY_TYPES, type EnergyType, type Player, type TokenType } from '../game/types';

const TOKEN_TYPES: TokenType[] = [...ENERGY_TYPES, 'wild'];
type GemSize = 'small' | 'inline' | 'summary' | 'cost';

export function GemIcon({ type, count, size = 'small' }: { type: TokenType; count?: number; size?: GemSize }) {
  const gemName = type === 'wild' ? '万能' : ENERGY_LABELS[type];
  const label = `${gemName}宝石${count === undefined ? '' : ` × ${count}`}`;
  return <span className={`gem-icon gem-${size} ${type}`} title={label} aria-label={label}><i>{ENERGY_ICONS[type]}</i>{count !== undefined && <b>{count}</b>}</span>;
}

export function GemRequirements({ requirement }: { requirement: Partial<Record<EnergyType, number>> }) {
  return <div className="badge-requirements" aria-label="徽章所需宝石">{Object.entries(requirement).map(([type, count]) => <GemIcon type={type as EnergyType} count={count} key={type}/>)}</div>;
}

export function PlayerGemSummary({ players, currentPlayerId }: { players: Player[]; currentPlayerId?: string }) {
  return (
    <div className="player-gem-summary" aria-label="各玩家当前持有宝石汇总">
      {players.map((player) => {
        const gems = TOKEN_TYPES.filter((type) => player.energies[type] > 0);
        return (
          <div className={`player-gem-row ${player.id === currentPlayerId ? 'current' : ''}`} key={player.id}>
            <strong title={player.name}>{player.name}</strong>
            <div className="player-gem-counts">
              {gems.length > 0 ? gems.map((type) => <GemIcon type={type} count={player.energies[type]} size="summary" key={type}/>) : <small>暂无宝石</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
