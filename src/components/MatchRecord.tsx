import type { MatchStats, Phase, Player } from '../game/types';

export function MatchRecord({ players, stats, phase, variant = 'header' }: {
  players: Player[];
  stats?: MatchStats;
  phase: Phase;
  variant?: 'header' | 'modal' | 'lobby';
}) {
  const gamesPlayed = stats?.gamesPlayed ?? 0;
  const roundText = phase === 'gameOver' ? `已完成 ${gamesPlayed} 局` : `第 ${gamesPlayed + 1} 局进行中`;
  return (
    <section className={`match-record ${variant}`} aria-label="连续对局记录">
      <div className="match-record-title"><strong>对局记录</strong><span>{roundText}</span></div>
      <div className="match-wins">
        {players.map((player) => <span title={`${player.name} 累计获胜 ${stats?.wins[player.id] ?? 0} 局`} key={player.id}><b>{player.name}</b><em>{stats?.wins[player.id] ?? 0} 胜</em></span>)}
      </div>
    </section>
  );
}
