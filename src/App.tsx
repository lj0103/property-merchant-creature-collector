import { useGameStore } from './store/gameStore'; import { SetupScreen } from './components/SetupScreen'; import { GameBoard } from './components/GameBoard';
export default function App(){const phase=useGameStore(s=>s.phase);return phase==='setup'?<SetupScreen/>:<GameBoard/>}
