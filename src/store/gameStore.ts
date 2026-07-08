import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SCORE_TARGET, ENERGY_LABELS } from '../data/constants';
import { createGame } from '../game/setup';
import { ENERGY_TYPES, type EnergyType, type GameState, type Level, type TokenType } from '../game/types';
import { canCapture, canClaimBadge, getScore, getWinners, paymentFor, tokenCount } from '../game/rules';

type Store = GameState & { hasSave:boolean; startGame:(names:string[])=>void; takeEnergies:(types:EnergyType[])=>void; reserveCard:(id:string)=>void; captureCard:(id:string,source:'market'|'reserved')=>void; discardEnergy:(type:TokenType)=>void; clearNotice:()=>void; resetGame:()=>void };
const empty:GameState={players:[],currentPlayerIndex:0,energyPool:{flame:0,aqua:0,leaf:0,spark:0,mind:0,wild:0},decks:{1:[],2:[],3:[]},market:{1:[],2:[],3:[]},availableBadges:[],phase:'setup',finalRoundTriggered:false,winnerIds:[],log:[]};
const note=(message:string)=>({notice:message});
const addLog=(s:GameState,message:string)=>[{id:crypto.randomUUID(),message},...s.log].slice(0,30);
const cloneState=(state:Store):Store=>({...state,players:structuredClone(state.players),energyPool:{...state.energyPool},decks:structuredClone(state.decks),market:structuredClone(state.market),availableBadges:structuredClone(state.availableBadges),winnerIds:[...state.winnerIds],log:structuredClone(state.log)});
const refill=(s:GameState, level:Level)=>{const next=s.decks[level][0];s.decks[level]=s.decks[level].slice(1);if(next)s.market[level].push(next);};
const finishAction=(s:GameState):Partial<GameState>=>{
  const p=s.players[s.currentPlayerIndex];
  if(tokenCount(p)>10)return{phase:'discarding',notice:`请归还 ${tokenCount(p)-10} 枚能量。`};
  p.turns++;
  if(!s.finalRoundTriggered&&getScore(p)>=SCORE_TARGET){s.finalRoundTriggered=true;s.targetTurns=Math.max(...s.players.map(x=>x.turns));s.log=addLog(s,`${p.name} 达到 ${SCORE_TARGET} 分，最终轮开始！`);}
  if(s.finalRoundTriggered&&s.players.every(x=>x.turns>=(s.targetTurns??0))){return{phase:'gameOver',winnerIds:getWinners(s.players),notice:'对局结束'};}
  const next=(s.currentPlayerIndex+1)%s.players.length;
  return{currentPlayerIndex:next,phase:'playing',notice:undefined};
};
export const useGameStore=create<Store>()(persist((set)=>({
  ...empty,hasSave:false,
  startGame:(names)=>set(()=>({...createGame(names),hasSave:true})),
  takeEnergies:(types)=>set(state=>{const s=cloneState(state);if(s.phase!=='playing')return note('当前不能获取能量');const unique=new Set(types);const different=types.length===3&&unique.size===3;const same=types.length===2&&unique.size===1;if(!different&&!same)return note('请选择 3 种不同能量，或同种能量 2 枚');if(types.some(t=>s.energyPool[t]<1))return note('公共池中能量不足');if(same&&s.energyPool[types[0]]<4)return note('拿取 2 枚时，公共池至少要有 4 枚');const p=s.players[s.currentPlayerIndex];types.forEach(t=>{s.energyPool[t]--;p.energies[t]++;});s.log=addLog(s,`${p.name} 获取了 ${types.map(t=>ENERGY_LABELS[t]).join('、')} 能量。`);return{...s,...finishAction(s)};}),
  reserveCard:(id)=>set(state=>{const s=cloneState(state);if(s.phase!=='playing')return note('当前不能预定');const p=s.players[s.currentPlayerIndex];if(p.reservedCards.length>=3)return note('最多只能预定 3 张精灵卡');let level:Level|undefined;for(const l of [1,2,3] as Level[])if(s.market[l].some(c=>c.id===id))level=l;if(!level)return note('卡牌已不在市场');const card=s.market[level].find(c=>c.id===id)!;s.market[level]=s.market[level].filter(c=>c.id!==id);p.reservedCards.push(card);refill(s,level);let wild='';if(s.energyPool.wild>0){s.energyPool.wild--;p.energies.wild++;wild='，并获得 1 枚灵能量';}s.log=addLog(s,`${p.name} 预定了「${card.name}」${wild}。`);return{...s,...finishAction(s)};}),
  captureCard:(id,source)=>set(state=>{const s=cloneState(state);if(s.phase!=='playing')return note('当前不能捕捉');const p=s.players[s.currentPlayerIndex];let card,level:Level|undefined;if(source==='reserved')card=p.reservedCards.find(c=>c.id===id);else for(const l of [1,2,3] as Level[]){const found=s.market[l].find(c=>c.id===id);if(found){card=found;level=l;break;}}if(!card)return note('找不到这张卡');if(!canCapture(p,card))return note('能量不足，暂时无法捕捉');const pay=paymentFor(p,card);for(const t of [...ENERGY_TYPES,'wild'] as TokenType[]){p.energies[t]-=pay[t];s.energyPool[t]+=pay[t];}p.capturedCards.push(card);if(source==='reserved')p.reservedCards=p.reservedCards.filter(c=>c.id!==id);else if(level){s.market[level]=s.market[level].filter(c=>c.id!==id);refill(s,level);}const won=s.availableBadges.filter(b=>canClaimBadge(p,b));p.badges.push(...won);s.availableBadges=s.availableBadges.filter(b=>!won.includes(b));s.log=addLog(s,`${p.name} 捕捉了「${card.name}」${won.length?`，并获得 ${won.map(b=>`「${b.name}」`).join('、')}`:''}。`);return{...s,...finishAction(s)};}),
  discardEnergy:(type)=>set(state=>{const s=cloneState(state);if(s.phase!=='discarding')return note('当前无需弃能量');const p=s.players[s.currentPlayerIndex];if(p.energies[type]<1)return note('没有这种能量可归还');p.energies[type]--;s.energyPool[type]++;s.log=addLog(s,`${p.name} 归还了 1 枚${ENERGY_LABELS[type]}能量。`);if(tokenCount(p)<=10)return{...s,...finishAction(s)};return{...s,notice:`请再归还 ${tokenCount(p)-10} 枚能量。`};}),
  clearNotice:()=>set({notice:undefined}),resetGame:()=>set({...empty,hasSave:false})
}),{name:'creature-collector-game',partialize:({hasSave,...state})=>({...state,hasSave:true})}));
