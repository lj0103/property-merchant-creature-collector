import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createGame } from '../game/setup';
import { type EnergyType, type GameState, type TokenType } from '../game/types';
import { applyGameAction } from '../game/actions';

type Store = GameState & { hasSave:boolean; startGame:(names:string[])=>void; takeEnergies:(types:EnergyType[])=>void; reserveCard:(id:string)=>void; captureCard:(id:string,source:'market'|'reserved')=>void; discardEnergy:(type:TokenType)=>void; clearNotice:()=>void; resetGame:()=>void };
const empty:GameState={players:[],currentPlayerIndex:0,energyPool:{flame:0,aqua:0,leaf:0,spark:0,mind:0,wild:0},decks:{1:[],2:[],3:[]},market:{1:[],2:[],3:[]},availableBadges:[],phase:'setup',finalRoundTriggered:false,winnerIds:[],log:[]};
const note=(message:string)=>({notice:message});
const runAction=(state:Store,result:ReturnType<typeof applyGameAction>)=>result.ok?{...result.state,hasSave:state.hasSave}:note(result.error??'行动失败');
export const useGameStore=create<Store>()(persist((set)=>({
  ...empty,hasSave:false,
  startGame:(names)=>set(()=>({...createGame(names),hasSave:true})),
  takeEnergies:(types)=>set(state=>runAction(state,applyGameAction(state,state.players[state.currentPlayerIndex]?.id??'',{type:'takeEnergies',energies:types}))),
  reserveCard:(id)=>set(state=>runAction(state,applyGameAction(state,state.players[state.currentPlayerIndex]?.id??'',{type:'reserveCard',cardId:id}))),
  captureCard:(id,source)=>set(state=>runAction(state,applyGameAction(state,state.players[state.currentPlayerIndex]?.id??'',{type:'captureCard',cardId:id,source}))),
  discardEnergy:(type)=>set(state=>runAction(state,applyGameAction(state,state.players[state.currentPlayerIndex]?.id??'',{type:'discardEnergy',energy:type}))),
  clearNotice:()=>set({notice:undefined}),resetGame:()=>set({...empty,hasSave:false})
}),{name:'creature-collector-game',partialize:({hasSave,...state})=>({...state,hasSave:true})}));
