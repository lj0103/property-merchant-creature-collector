import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { GameRulesDialog } from './GameRulesDialog';

export function SetupScreen({ onOnline }: { onOnline: () => void }) {
  const start = useGameStore((state) => state.startGame);
  const hasSave = useGameStore((state) => state.hasSave);
  const [count, setCount] = useState(2);
  const [names, setNames] = useState(['玩家 1', '玩家 2', '玩家 3', '玩家 4', '玩家 5']);

  return (
    <main className="setup">
      <div className="table-glow" aria-hidden="true" />
      <div className="setup-card">
        <div className="box-ribbon">桌游典藏版</div>
        <div className="brand-mark">✦</div>
        <p className="eyebrow">五行灵珠 · 精灵契约 · 2–5 人</p>
        <h1>属性商人<br/><span>精灵收集家</span></h1>
        <p className="intro">围坐雾岚长桌，采集五行灵珠，与奇妙生灵缔结永久羁绊。率先抵达 15 分，在最终轮守住荣光。</p>
        <div className="mode-switch">
          <button className="ghost dark" onClick={onOnline}>◎ 进入线上多人桌</button>
          <GameRulesDialog/>
        </div>
        <div className="setup-divider"><span>本地围桌</span></div>
        <div className="count-pills">
          {[2, 3, 4, 5].map((number) => <button className={count === number ? 'active' : ''} onClick={() => setCount(number)} key={number}>{number}<small>人</small></button>)}
        </div>
        <div className={`name-grid players-${count}`}>
          {names.slice(0, count).map((name, index) => <label key={index}><span>席位 {index + 1}</span><input value={name} maxLength={12} onChange={(event) => setNames((value) => value.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}/></label>)}
        </div>
        <button className="primary big" onClick={() => start(names.slice(0, count))}>铺开桌面，开始旅程 <span>→</span></button>
        {hasSave && <p className="save-hint">✦ 已找到上次的桌面，存档会自动恢复</p>}
      </div>
    </main>
  );
}
