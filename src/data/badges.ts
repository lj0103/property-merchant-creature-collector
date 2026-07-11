import type { Badge } from '../game/types';
export const BADGES: Badge[] = [
 {id:'b1',name:'水火共鸣',points:3,requirement:{flame:3,aqua:3},description:'水火相济所凝成的印记。'},
 {id:'b2',name:'木息回响',points:3,requirement:{leaf:4},description:'林间万物认可的印记。'},
 {id:'b3',name:'金土同契',points:3,requirement:{spark:3,mind:3},description:'金石与厚土结成的契约。'},
 {id:'b4',name:'五行旅者',points:3,requirement:{flame:2,aqua:2,leaf:2,spark:2,mind:2},description:'五行灵珠皆为同行伙伴。'},
 {id:'b5',name:'木火相生',points:3,requirement:{flame:3,leaf:3},description:'守护新芽的温暖之光。'},
 {id:'b6',name:'金水相涵',points:3,requirement:{aqua:3,spark:3},description:'金水相生的收藏家印记。'},
 {id:'b7',name:'木土归元',points:3,requirement:{leaf:3,mind:3},description:'根系与厚土彼此滋养。'},
];
