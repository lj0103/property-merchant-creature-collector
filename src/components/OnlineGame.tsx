import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ENERGY_ICONS, ENERGY_LABELS, SCORE_TARGET } from '../data/constants';
import { CARD_COUNTS_BY_LEVEL } from '../data/cards';
import { canPassTurn, type GameAction } from '../game/actions';
import { ENERGY_TYPES, type EnergyType, type TokenType } from '../game/types';
import { getDiscounts, getScore, rankPlayers, tokenCount } from '../game/rules';
import type { ClientToServerEvents, RoomPayload, ServerToClientEvents, SessionPayload } from '../multiplayer/protocol';
import { CreatureCard } from './CreatureCard';
import { GemRequirements, PlayerGemSummary } from './GemDisplay';

const sessionKey = 'property-merchant-online-session';
const apiUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:8787';

type OnlineSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function OnlineGame({ onBack }: { onBack: () => void }) {
  const [socket, setSocket] = useState<OnlineSocket>();
  const [session, setSession] = useState<SessionPayload>();
  const [room, setRoom] = useState<RoomPayload>();
  const [displayName, setDisplayName] = useState(localStorage.getItem('property-merchant-display-name') ?? '旅人');
  const [roomCode, setRoomCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4 | 5>(2);
  const [message, setMessage] = useState('正在连接联机服务器…');
  const [selected, setSelected] = useState<EnergyType[]>([]);

  useEffect(() => {
    let active = true;
    let nextSocket: OnlineSocket | undefined;

    const connect = async () => {
      try {
        const legacySessionToken = localStorage.getItem(sessionKey) ?? undefined;
        const sessionResponse = await fetch(`${apiUrl}/api/session`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName, legacySessionToken }),
        });
        if (!sessionResponse.ok) throw new Error('无法建立安全会话');
        const restored = (await sessionResponse.json()) as { session: SessionPayload; room?: RoomPayload };
        if (!active) return;

        localStorage.removeItem(sessionKey);
        localStorage.setItem('property-merchant-display-name', restored.session.displayName);
        setSession(restored.session);
        setRoom(restored.room);

        nextSocket = io(apiUrl, { autoConnect: true, withCredentials: true });
        setSocket(nextSocket);
        nextSocket.on('connect', () => {
          nextSocket?.emit('session:restore', { displayName }, (response) => {
            if (response.error || !response.session) {
              setMessage(response.error?.message ?? '安全会话恢复失败');
              return;
            }
            setSession(response.session);
            setRoom(response.room);
            localStorage.setItem('property-merchant-display-name', response.session.displayName);
            setMessage(response.room ? `已恢复房间 ${response.room.code}` : '已连接，可以创建或加入房间。');
          });
        });
        nextSocket.on('room:update', (nextRoom) => {
          setRoom(nextRoom);
          setMessage(`房间 ${nextRoom.code} 已同步。`);
        });
        nextSocket.on('room:closed', (payload) => {
          setRoom(undefined);
          setMessage(payload.message);
        });
        nextSocket.on('server:error', (error) => setMessage(error.message));
        nextSocket.on('connect_error', (connectionError) => {
          setMessage(connectionError.message === 'UNAUTHORIZED' ? '安全会话已失效，请刷新页面重试。' : '无法连接联机服务器。');
        });
        nextSocket.on('disconnect', () => setMessage('连接已断开，正在尝试重连…'));
      } catch (cause) {
        if (active) setMessage(cause instanceof Error ? cause.message : '无法连接联机服务器');
      }
    };

    void connect();
    return () => {
      active = false;
      nextSocket?.disconnect();
    };
  }, []);

  const me = useMemo(() => room?.players.find((player) => player.playerId === session?.playerId), [room, session]);
  const game = room?.gameState;
  const currentPlayer = game?.players[game.currentPlayerIndex];
  const isMyTurn = Boolean(game && currentPlayer?.id === session?.playerId);
  const activePlayer = game ? game.players.find((player) => player.id === session?.playerId) ?? currentPlayer : undefined;
  const discounts = activePlayer ? getDiscounts(activePlayer) : undefined;
  const ordinaryGemsEmpty = Boolean(game && ENERGY_TYPES.every((energy) => game.energyPool[energy] === 0));
  const mayPass = Boolean(game && session && canPassTurn(game, session.playerId));
  const actionHint = mayPass ? '没有任何可执行行动，可以跳过回合' : ordinaryGemsEmpty ? '五行灵珠已空，请捕捉或预定精灵' : isMyTurn ? '每回合可拿灵珠、捕捉或预定' : '等待当前玩家行动';
  const validEnergySelection =
    (selected.length === 3 && new Set(selected).size === 3) ||
    (selected.length === 1 && Boolean(game && game.energyPool[selected[0]] >= 4));

  const updateName = () => {
    if (!socket) return;
    socket.emit('session:restore', { displayName }, (response) => {
      if (response.error || !response.session) {
        setMessage(response.error?.message ?? '昵称更新失败');
        return;
      }
      setSession(response.session);
      setRoom(response.room);
      localStorage.setItem('property-merchant-display-name', response.session.displayName);
      setMessage('昵称已更新。');
    });
  };

  const createRoom = () => {
    socket?.emit('room:create', { maxPlayers }, (response) => {
      if (response.error) return setMessage(response.error.message);
      setRoom(response.room);
      setMessage(`房间已创建：${response.room?.code}`);
    });
  };

  const joinRoom = () => {
    socket?.emit('room:join', { code: roomCode }, (response) => {
      if (response.error) return setMessage(response.error.message);
      setRoom(response.room);
      setMessage(`已加入房间：${response.room?.code}`);
    });
  };

  const setReady = (isReady: boolean) => {
    socket?.emit('room:ready', { isReady }, (response) => {
      if (response.error) setMessage(response.error.message);
    });
  };

  const startGame = () => {
    socket?.emit('room:start', {}, (response) => {
      if (response.error) setMessage(response.error.message);
    });
  };

  const restartGame = () => {
    socket?.emit('room:restart', {}, (response) => {
      if (response.error) setMessage(response.error.message);
    });
  };

  const leaveRoom = () => {
    socket?.emit('room:leave', {}, (response) => {
      if (response.error) return setMessage(response.error.message);
      setRoom(undefined);
      setSelected([]);
      setMessage('已离开房间。');
    });
  };

  const sendAction = (action: GameAction) => {
    socket?.emit('game:action', { action, actionId: crypto.randomUUID() }, (response) => {
      if (response.error) return setMessage(response.error.message);
      setSelected([]);
    });
  };

  const toggleEnergy = (energy: EnergyType) => {
    setSelected((value) =>
      value.includes(energy) ? value.filter((item) => item !== energy) : value.length < 3 ? [...value, energy] : value,
    );
  };

  if (!room || !game) {
    return (
      <main className="setup online-setup">
        <div className="setup-card online-card">
          <button className="text-btn" onClick={onBack}>← 返回本地模式</button>
          <div className="brand-mark">⇄</div>
          <p className="eyebrow">真实多人在线</p>
          <h1>线上房间<br/><span>精灵收集家</span></h1>
          <p className="intro">创建房间、分享房间码，2–5 名玩家可在不同设备实时游玩。服务器会统一校验所有行动。</p>
          <label className="online-field"><span>你的昵称</span><input value={displayName} maxLength={12} onChange={(event)=>setDisplayName(event.target.value)} onBlur={updateName}/></label>
          {!room && <div className="online-columns">
            <section>
              <h2>创建房间</h2>
              <div className="count-pills">{([2,3,4,5] as const).map((count)=><button className={maxPlayers===count?'active':''} onClick={()=>setMaxPlayers(count)} key={count}>{count} 人</button>)}</div>
              <button className="primary big" onClick={createRoom}>创建线上房间</button>
            </section>
            <section>
              <h2>加入房间</h2>
              <label className="online-field"><span>房间码</span><input value={roomCode} maxLength={8} placeholder="例如 A7K2Q" onChange={(event)=>setRoomCode(event.target.value.toUpperCase())}/></label>
              <button className="primary big" onClick={joinRoom}>加入房间</button>
            </section>
          </div>}
          {room && <section className="lobby-box">
            <p className="eyebrow">房间码</p>
            <h2>{room.code}</h2>
            <p className="intro">把房间码发给朋友。所有玩家准备后，房主可以开始。</p>
            <div className="lobby-players">{room.players.map((player)=><p key={player.playerId}><b>{player.displayName}</b><span>{player.isHost?'房主':player.isReady?'已准备':'未准备'} · {player.connectionState}</span></p>)}</div>
            <div className="lobby-actions">
              <button className="primary" onClick={()=>setReady(!me?.isReady)}>{me?.isReady?'取消准备':'准备'}</button>
              {me?.isHost&&<button className="primary" onClick={startGame}>开始游戏</button>}
              <button className="ghost" onClick={leaveRoom}>离开房间</button>
            </div>
          </section>}
          <p className="save-hint">{message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="board">
      <header>
        <div className="game-brand"><span className="mini-mark">✦</span><div><p className="eyebrow">线上长桌 · {room.code}</p><h1>精灵收集家</h1></div></div>
        <div className="turn"><span>{isMyTurn?'轮到你的席位':'当前行动席'}</span><strong>{currentPlayer?.name}</strong></div>
        <div className="target"><span>{game.finalRoundTriggered?'最终轮进行中':'目标声望'}</span><strong>{SCORE_TARGET}</strong></div>
        <button className="ghost" onClick={leaveRoom}>离开长桌</button>
      </header>
      <button className="notice" onClick={()=>setMessage('')}>{message}<span>×</span></button>
      <div className="table-surface">
      <div className="table-inscription">ONLINE TABLE · ROOM {room.code}</div>
      <section className="player-strip">{room.players.map((roomPlayer,index)=>{
        const player = game.players.find((item)=>item.id===roomPlayer.playerId);
        return <div className={`${player?.id===currentPlayer?.id?'current':''} ${roomPlayer.playerId===session?.playerId?'is-self':''}`} key={roomPlayer.playerId}><span className="seat-number">{index+1}</span><span className="avatar">{roomPlayer.displayName.slice(0,1)}</span><p><strong>{roomPlayer.displayName}{roomPlayer.playerId===session?.playerId?' · 你':''}</strong><small>{player?`${getScore(player)} 声望 · ${player.capturedCards.length} 精灵 · ${player.turns} 回合`:roomPlayer.isReady?'已准备':'未准备'} · {roomPlayer.connectionState}</small></p><i className="turn-lamp" /></div>;
      })}</section>
      <div className="layout">
        <aside className="left-panel panel">
          <div className="panel-heading"><span>五行灵珠区</span><h2>公共灵珠</h2><p>{actionHint}</p></div>
          <div className="energy-pool">{ENERGY_TYPES.map((energy)=><button className={`energy ${energy} ${selected.includes(energy)?'selected':''}`} disabled={!isMyTurn||game.phase!=='playing'||game.energyPool[energy]===0} onClick={()=>toggleEnergy(energy)} key={energy}><i>{ENERGY_ICONS[energy]}</i><span>{ENERGY_LABELS[energy]}灵珠</span><b>{game.energyPool[energy]}</b></button>)}<div className="energy wild" title="灵珠是万能资源，不能直接拿取；预定公开精灵卡时，如果公共区还有灵珠，会自动获得 1 枚。"><i>{ENERGY_ICONS.wild}</i><span>灵珠<small className="wild-help">万能 · 预定时获得</small></span><b>{game.energyPool.wild}</b></div></div>
          <button className="primary" disabled={!isMyTurn||!validEnergySelection||game.phase!=='playing'} onClick={()=>sendAction({type:'takeEnergies',energies:selected.length===1?[selected[0],selected[0]]:selected})}>{selected.length===1?'拿取同色灵珠 ×2':'拿取所选灵珠'}</button>
          {mayPass&&isMyTurn?<button className="pass-turn" onClick={()=>sendAction({type:'passTurn'})}>当前无可执行行动 · 跳过回合</button>:<button className="text-btn" onClick={()=>setSelected([])}>清空选择</button>}
          <div className="badges"><div className="panel-heading compact"><span>桌面目标</span><h2>旅者徽章</h2><p>仅统计永久羁绊，持有灵珠不能代替</p></div>{game.availableBadges.map((badge)=><div className="badge" title="达成条件仅计算已捕捉精灵提供的永久羁绊" key={badge.id}><i>✧</i><div className="badge-copy"><strong>{badge.name} <em>+{badge.points}</em></strong><div className="badge-condition"><span>绊</span><GemRequirements requirement={badge.requirement}/></div></div></div>)}</div>
        </aside>
        <section className="market">
          <div className="market-title"><div><p className="eyebrow">服务器同步 · 中央公共牌区</p><h2>雾岚精灵市集</h2></div><p>剩余牌量 · {[3,2,1].map((level)=>{const tier=level as 1|2|3;return `L${level} ${game.decks[tier].length+game.market[tier].length}/${CARD_COUNTS_BY_LEVEL[tier]}`;}).join(' / ')}</p></div>
          {([3,2,1] as const).map((level)=><section className="market-row" key={level}><div className={`deck level-${level}`}><small>精灵牌库</small><b>等级 {level}</b><span>{game.decks[level].length}</span></div><div className="cards">{game.market[level].map((card)=><CreatureCard card={card} player={currentPlayer!} disabled={!isMyTurn} phase={game.phase} onReserve={(cardId)=>sendAction({type:'reserveCard',cardId})} onCapture={(cardId,source)=>sendAction({type:'captureCard',cardId,source})} key={card.id}/>)}</div></section>)}
        </section>
        <aside className="right-panel panel player-mat">
          {activePlayer && <>
            <div className="profile"><span className="avatar large">{activePlayer.name.slice(0,1)}</span><div><p className="eyebrow">{isMyTurn?'你的回合':'你的状态'}</p><h2>{activePlayer.name}</h2></div><strong className="score">{getScore(activePlayer)}<small>/ {SCORE_TARGET}</small></strong></div>
            <h3 className="section-label">持有灵珠 <span>{tokenCount(activePlayer)}/10</span></h3>
            <div className="wallet">{([...ENERGY_TYPES,'wild'] as TokenType[]).map((energy)=><button disabled={!isMyTurn||game.phase!=='discarding'||activePlayer.energies[energy]===0} onClick={()=>sendAction({type:'discardEnergy',energy})} className={`token ${energy}`} key={energy}>{ENERGY_ICONS[energy]} <b>{activePlayer.energies[energy]}</b></button>)}</div>
            {game.phase==='discarding'&&isMyTurn&&<p className="discard-tip">点击上方灵珠归还至 10 枚</p>}
            <h3 className="section-label">永久羁绊 <span>永久折扣</span></h3><div className="discounts">{ENERGY_TYPES.map((energy)=><span className={energy} title={`${ENERGY_LABELS[energy]}系永久羁绊：捕捉时永久减免 ${discounts?.[energy]??0} 枚${ENERGY_LABELS[energy]}灵珠，不会消耗`} key={energy}>{ENERGY_ICONS[energy]} {discounts?.[energy]??0}</span>)}</div>
            <h3 className="section-label">预定精灵 <span>{activePlayer.reservedCards.length}/3</span></h3>
            <div className="reserved">{activePlayer.reservedCards.length?activePlayer.reservedCards.map((card)=><CreatureCard card={card} player={activePlayer} source="reserved" disabled={!isMyTurn} phase={game.phase} onCapture={(cardId,source)=>sendAction({type:'captureCard',cardId,source})} key={card.id}/>):<p>尚未预定精灵</p>}</div>
          </>}
          <h3 className="section-label">桌边旅记 <span>灵珠 / 羁绊</span></h3><div className="resource-legend"><span><b>持</b>捕捉时消耗</span><span><b>绊</b>永久折扣不消耗</span></div><PlayerGemSummary players={game.players} currentPlayerId={currentPlayer?.id}/>
        </aside>
      </div>
      </div>
      {game.phase==='gameOver'&&<div className="modal"><div><span className="trophy">✦</span><p className="eyebrow">线上对局结束</p><h2>{game.winnerIds.length>1?'并列胜利！':'胜利属于'} {game.players.filter((player)=>game.winnerIds.includes(player.id)).map((player)=>player.name).join('、')}</h2>{rankPlayers(game.players).map((player,index)=><p className="ranking" key={player.id}><b>#{index+1} {player.name}</b><span>{getScore(player)} 分 · {player.capturedCards.length} 张卡</span></p>)}{me?.isHost&&<button className="primary big" onClick={restartGame}>再来一局</button>}</div></div>}
    </main>
  );
}
