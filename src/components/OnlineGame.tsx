import { useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { ENERGY_ICONS, ENERGY_LABELS, SCORE_TARGET } from '../data/constants';
import type { GameAction } from '../game/actions';
import { ENERGY_TYPES, type EnergyType, type TokenType } from '../game/types';
import { getDiscounts, getScore, rankPlayers, tokenCount } from '../game/rules';
import type { ClientToServerEvents, RoomPayload, ServerToClientEvents, SessionPayload } from '../multiplayer/protocol';
import { CreatureCard } from './CreatureCard';

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
        <div><p className="eyebrow">线上房间 {room.code}</p><h1>精灵收集家</h1></div>
        <div className="turn"><span>{isMyTurn?'轮到你了':'当前回合'}</span><strong>{currentPlayer?.name}</strong></div>
        <div className="target"><span>{game.finalRoundTriggered?'最终轮进行中':'目标分数'}</span><strong>{SCORE_TARGET}</strong></div>
        <button className="ghost" onClick={leaveRoom}>离开房间</button>
      </header>
      <button className="notice" onClick={()=>setMessage('')}>{message}<span>×</span></button>
      <section className="player-strip">{room.players.map((roomPlayer)=>{
        const player = game.players.find((item)=>item.id===roomPlayer.playerId);
        return <div className={player?.id===currentPlayer?.id?'current':''} key={roomPlayer.playerId}><span className="avatar">{roomPlayer.displayName.slice(0,1)}</span><p><strong>{roomPlayer.displayName}</strong><small>{player?`${getScore(player)} 分 · ${player.capturedCards.length} 只精灵 · ${player.turns} 回合`:roomPlayer.isReady?'已准备':'未准备'} · {roomPlayer.connectionState}</small></p></div>;
      })}</section>
      <div className="layout">
        <aside className="left-panel panel">
          <h2>能量泉</h2>
          <p className="sub">{isMyTurn?'点击选择能量':'等待当前玩家行动'}</p>
          <div className="energy-pool">{ENERGY_TYPES.map((energy)=><button className={`energy ${energy} ${selected.includes(energy)?'selected':''}`} disabled={!isMyTurn||game.phase!=='playing'||game.energyPool[energy]===0} onClick={()=>toggleEnergy(energy)} key={energy}><i>{ENERGY_ICONS[energy]}</i><span>{ENERGY_LABELS[energy]}</span><b>{game.energyPool[energy]}</b></button>)}<div className="energy wild"><i>{ENERGY_ICONS.wild}</i><span>万能·灵</span><b>{game.energyPool.wild}</b></div></div>
          <button className="primary" disabled={!isMyTurn||!validEnergySelection||game.phase!=='playing'} onClick={()=>sendAction({type:'takeEnergies',energies:selected.length===1?[selected[0],selected[0]]:selected})}>{selected.length===1?'获取同种 ×2':'确认获取'}</button>
          <button className="text-btn" onClick={()=>setSelected([])}>清空选择</button>
          <div className="badges"><h2>旅者徽章</h2>{game.availableBadges.map((badge)=><div className="badge" key={badge.id}><i>✧</i><p><strong>{badge.name} <em>+{badge.points}</em></strong><small>{Object.entries(badge.requirement).map(([energy,count])=>`${ENERGY_LABELS[energy as TokenType]} ${count}`).join(' · ')}</small></p></div>)}</div>
        </aside>
        <section className="market">
          <div className="market-title"><div><p className="eyebrow">服务器权威同步</p><h2>精灵市集</h2></div><p>每层剩余牌：{[3,2,1].map((level)=>`L${level} ${game.decks[level as 1|2|3].length}`).join(' · ')}</p></div>
          {([3,2,1] as const).map((level)=><section className="market-row" key={level}><div className={`deck level-${level}`}><b>等级 {level}</b><span>{game.decks[level].length}</span></div><div className="cards">{game.market[level].map((card)=><CreatureCard card={card} player={currentPlayer!} disabled={!isMyTurn} phase={game.phase} onReserve={(cardId)=>sendAction({type:'reserveCard',cardId})} onCapture={(cardId,source)=>sendAction({type:'captureCard',cardId,source})} key={card.id}/>)}</div></section>)}
        </section>
        <aside className="right-panel panel">
          {activePlayer && <>
            <div className="profile"><span className="avatar large">{activePlayer.name.slice(0,1)}</span><div><p className="eyebrow">{isMyTurn?'你的回合':'你的状态'}</p><h2>{activePlayer.name}</h2></div><strong className="score">{getScore(activePlayer)}<small>/ {SCORE_TARGET}</small></strong></div>
            <h3 className="section-label">持有能量 <span>{tokenCount(activePlayer)}/10</span></h3>
            <div className="wallet">{([...ENERGY_TYPES,'wild'] as TokenType[]).map((energy)=><button disabled={!isMyTurn||game.phase!=='discarding'||activePlayer.energies[energy]===0} onClick={()=>sendAction({type:'discardEnergy',energy})} className={`token ${energy}`} key={energy}>{ENERGY_ICONS[energy]} <b>{activePlayer.energies[energy]}</b></button>)}</div>
            {game.phase==='discarding'&&isMyTurn&&<p className="discard-tip">点击上方能量归还至 10 枚</p>}
            <h3 className="section-label">永久羁绊</h3><div className="discounts">{ENERGY_TYPES.map((energy)=><span className={energy} key={energy}>{ENERGY_ICONS[energy]} {discounts?.[energy]??0}</span>)}</div>
            <h3 className="section-label">预定精灵 <span>{activePlayer.reservedCards.length}/3</span></h3>
            <div className="reserved">{activePlayer.reservedCards.length?activePlayer.reservedCards.map((card)=><CreatureCard card={card} player={activePlayer} source="reserved" disabled={!isMyTurn} phase={game.phase} onCapture={(cardId,source)=>sendAction({type:'captureCard',cardId,source})} key={card.id}/>):<p>尚未预定精灵</p>}</div>
          </>}
          <h3 className="section-label">近期旅记</h3><div className="log">{game.log.slice(0,6).map((entry)=><p key={entry.id}>{entry.message}</p>)}</div>
        </aside>
      </div>
      {game.phase==='gameOver'&&<div className="modal"><div><span className="trophy">✦</span><p className="eyebrow">线上对局结束</p><h2>{game.winnerIds.length>1?'并列胜利！':'胜利属于'} {game.players.filter((player)=>game.winnerIds.includes(player.id)).map((player)=>player.name).join('、')}</h2>{rankPlayers(game.players).map((player,index)=><p className="ranking" key={player.id}><b>#{index+1} {player.name}</b><span>{getScore(player)} 分 · {player.capturedCards.length} 张卡</span></p>)}{me?.isHost&&<button className="primary big" onClick={restartGame}>再来一局</button>}</div></div>}
    </main>
  );
}
