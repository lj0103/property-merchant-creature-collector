import { useState } from 'react';
import { ENERGY_TYPES, type EnergyType, type TokenType } from '../game/types';
import { ENERGY_ICONS, ENERGY_LABELS, SCORE_TARGET } from '../data/constants';
import { getDiscounts, getScore, rankPlayers, tokenCount } from '../game/rules';
import { useGameStore } from '../store/gameStore';
import { CreatureCard } from './CreatureCard';

export function GameBoard() {
  const state = useGameStore();
  const [selected, setSelected] = useState<EnergyType[]>([]);
  const player = state.players[state.currentPlayerIndex];
  const discounts = getDiscounts(player);
  const toggle = (type: EnergyType) => setSelected((value) => value.includes(type) ? value.filter((item) => item !== type) : value.length < 3 ? [...value, type] : value);
  const valid = (selected.length === 3 && new Set(selected).size === 3) || (selected.length === 1 && state.energyPool[selected[0]] >= 4);
  const take = () => {
    state.takeEnergies(selected.length === 1 ? [selected[0], selected[0]] : selected);
    setSelected([]);
  };

  return (
    <main className="board">
      <header>
        <div className="game-brand"><span className="mini-mark">✦</span><div><p className="eyebrow">雾岚长桌</p><h1>精灵收集家</h1></div></div>
        <div className="turn"><span>行动席位</span><strong>{player.name}</strong></div>
        <div className="target"><span>{state.finalRoundTriggered ? '最终轮进行中' : '目标声望'}</span><strong>{SCORE_TARGET}</strong></div>
        <button className="ghost" onClick={() => confirm('确定收起当前桌面并返回首页？') && state.resetGame()}>收起桌面</button>
      </header>
      {state.notice && <button className="notice" onClick={state.clearNotice}>{state.notice}<span>×</span></button>}
      <div className="table-surface">
        <div className="table-inscription">PROPERTY MERCHANT · CREATURE COLLECTOR</div>
        <section className="player-strip">
          {state.players.map((item, index) => <div className={index === state.currentPlayerIndex ? 'current' : ''} key={item.id}><span className="seat-number">{index + 1}</span><span className="avatar">{item.name.slice(0, 1)}</span><p><strong>{item.name}</strong><small>{getScore(item)} 声望 · {item.capturedCards.length} 精灵 · {item.turns} 回合</small></p><i className="turn-lamp" /></div>)}
        </section>
        <div className="layout">
          <aside className="left-panel panel">
            <div className="panel-heading"><span>五相供给区</span><h2>能量筹码</h2><p>{state.phase === 'playing' ? '从桌面中央拿取筹码' : '请先归还多余筹码'}</p></div>
            <div className="energy-pool">{ENERGY_TYPES.map((type) => <button className={`energy ${type} ${selected.includes(type) ? 'selected' : ''}`} disabled={state.phase !== 'playing' || state.energyPool[type] === 0} onClick={() => toggle(type)} key={type}><i>{ENERGY_ICONS[type]}</i><span>{ENERGY_LABELS[type]}</span><b>{state.energyPool[type]}</b></button>)}<div className="energy wild"><i>{ENERGY_ICONS.wild}</i><span>万能·灵</span><b>{state.energyPool.wild}</b></div></div>
            <button className="primary" disabled={!valid || state.phase !== 'playing'} onClick={take}>{selected.length === 1 ? '拿取同种 ×2' : '拿取所选筹码'}</button>
            <button className="text-btn" onClick={() => setSelected([])}>放回选择</button>
            <div className="badges"><div className="panel-heading compact"><span>桌面目标</span><h2>旅者徽章</h2></div>{state.availableBadges.map((badge) => <div className="badge" key={badge.id}><i>✧</i><p><strong>{badge.name} <em>+{badge.points}</em></strong><small>{Object.entries(badge.requirement).map(([type, count]) => `${ENERGY_LABELS[type as TokenType]} ${count}`).join(' · ')}</small></p></div>)}</div>
          </aside>
          <section className="market">
            <div className="market-title"><div><p className="eyebrow">中央公共牌区</p><h2>雾岚精灵市集</h2></div><p>牌库余量 · {[3, 2, 1].map((level) => `L${level} ${state.decks[level as 1 | 2 | 3].length}`).join(' / ')}</p></div>
            {([3, 2, 1] as const).map((level) => <section className="market-row" key={level}><div className={`deck level-${level}`}><small>精灵牌库</small><b>等级 {level}</b><span>{state.decks[level].length}</span></div><div className="cards">{state.market[level].map((card) => <CreatureCard card={card} player={player} key={card.id}/>)}</div></section>)}
          </section>
          <aside className="right-panel panel player-mat">
            <div className="profile"><span className="avatar large">{player.name.slice(0, 1)}</span><div><p className="eyebrow">近端玩家席</p><h2>{player.name}</h2></div><strong className="score">{getScore(player)}<small>/ {SCORE_TARGET}</small></strong></div>
            <h3 className="section-label">手中筹码 <span>{tokenCount(player)}/10</span></h3>
            <div className="wallet">{([...ENERGY_TYPES, 'wild'] as TokenType[]).map((type) => <button disabled={state.phase !== 'discarding' || player.energies[type] === 0} onClick={() => state.discardEnergy(type)} className={`token ${type}`} key={type}>{ENERGY_ICONS[type]} <b>{player.energies[type]}</b></button>)}</div>
            {state.phase === 'discarding' && <p className="discard-tip">点击筹码，将持有数量归还至 10 枚</p>}
            <h3 className="section-label">永久羁绊</h3><div className="discounts">{ENERGY_TYPES.map((type) => <span className={type} key={type}>{ENERGY_ICONS[type]} {discounts[type]}</span>)}</div>
            <h3 className="section-label">预定区 <span>{player.reservedCards.length}/3</span></h3>
            <div className="reserved">{player.reservedCards.length ? player.reservedCards.map((card) => <CreatureCard card={card} player={player} source="reserved" key={card.id}/>) : <p>尚未压下任何预定牌</p>}</div>
            <h3 className="section-label">桌边旅记</h3><div className="log">{state.log.slice(0, 6).map((entry) => <p key={entry.id}>{entry.message}</p>)}</div>
          </aside>
        </div>
      </div>
      {state.phase === 'gameOver' && <div className="modal"><div><span className="trophy">✦</span><p className="eyebrow">本桌旅程告一段落</p><h2>{state.winnerIds.length > 1 ? '并列胜利！' : '胜利属于'} {state.players.filter((item) => state.winnerIds.includes(item.id)).map((item) => item.name).join('、')}</h2>{rankPlayers(state.players).map((item, index) => <p className="ranking" key={item.id}><b>#{index + 1} {item.name}</b><span>{getScore(item)} 声望 · {item.capturedCards.length} 张牌</span></p>)}<button className="primary big" onClick={state.resetGame}>重新铺桌</button></div></div>}
    </main>
  );
}
