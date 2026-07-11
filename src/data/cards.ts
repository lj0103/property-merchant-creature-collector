import type { CreatureCard, EnergyType, Level } from '../game/types';

const names: Record<EnergyType, string[]> = {
  flame: ['火绒狐','烬尾雀','熔岩团子','暖灯貂','赤角兽','曜焰狮','曦火凰','赤霞麒麟'],
  aqua: ['潮泡龟','雾鳍鱼','涟漪獭','月湾鳐','沧澜鲸','镜海蛟','霁雨鲲','玄渊龙'],
  leaf: ['苔绒鹿','芽冠兔','藤铃猫','苍木熊','森语蝶','古枝猿','翠穹鹿','青藤鹤'],
  spark: ['金纹鹿','铜铃鼬','银翎雀','玄铁羊','流金貂','云锻鹰','天炉兽','鎏金狮'],
  mind: ['岩砂狸','琥珀鸮','陶土貘','地晶狐','山眠龙','石隙鲸','厚土龙','磐岳龟'],
};
const flavor: Record<EnergyType, string> = { flame:'在余烬旁留下温暖足迹。',aqua:'把清凉水汽藏进鳞片。',leaf:'能听见种子萌芽的声音。',spark:'行走时会响起清越金鸣。',mind:'在厚土与岩层之间安睡。' };
const costs: Record<Level, number[][]> = {
  1: [[0,1,1,1,1],[0,0,2,1,1],[0,2,0,2,1]],
  2: [[0,2,2,3,1],[0,3,2,2,2]],
  3: [[0,3,4,4,3],[0,5,3,3,4]],
};
const elements: EnergyType[] = ['flame','aqua','leaf','spark','mind'];
// 采用经典《璀璨宝石》的发展卡规模：等级 1 / 2 / 3 分别为 40 / 30 / 20 张。
export const CARD_COUNTS_BY_LEVEL: Record<Level, number> = {1:40,2:30,3:20};
export const CREATURE_CARDS: CreatureCard[] = ([1,2,3] as Level[]).flatMap(level =>
  Array.from({length: CARD_COUNTS_BY_LEVEL[level]}, (_, i) => {
    const element = elements[i % 5];
    const pattern = costs[level][Math.floor(i / 5) % costs[level].length];
    const rotated = elements.map((type, j) => [type, pattern[(j - (i % 5) + 5) % 5]] as const);
    return { id:`c${level}${String(i+1).padStart(2,'0')}`, name:names[element][Math.floor(i/5)+level-1], level, element, points: level===1?(i>9?1:0):level===2?(i>4?2:1):(i>4?5:4), cost:Object.fromEntries(rotated.filter(([,n])=>n>0)), description:flavor[element] };
  })
);
