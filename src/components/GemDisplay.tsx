import { Fragment } from 'react';
import { ENERGY_ICONS, ENERGY_LABELS } from '../data/constants';
import type { EnergyType, TokenType } from '../game/types';

const LABEL_TO_TYPE: Record<string, TokenType> = {
  焰: 'flame',
  潮: 'aqua',
  森: 'leaf',
  雷: 'spark',
  念: 'mind',
  灵: 'wild',
};

export function GemIcon({ type, count, size = 'small' }: { type: TokenType; count?: number; size?: 'small' | 'inline' }) {
  const label = `${ENERGY_LABELS[type]}宝石${count === undefined ? '' : ` × ${count}`}`;
  return <span className={`gem-icon gem-${size} ${type}`} title={label} aria-label={label}><i>{ENERGY_ICONS[type]}</i>{count !== undefined && <b>{count}</b>}</span>;
}

export function GemRequirements({ requirement }: { requirement: Partial<Record<EnergyType, number>> }) {
  return <div className="badge-requirements" aria-label="徽章所需宝石">{Object.entries(requirement).map(([type, count]) => <GemIcon type={type as EnergyType} count={count} key={type}/>)}</div>;
}

export function GemLog({ message }: { message: string }) {
  return <>{message.split(/(焰|潮|森|雷|念|灵)/g).map((segment, index) => {
    const type = LABEL_TO_TYPE[segment];
    return <Fragment key={`${segment}-${index}`}>{type ? <GemIcon type={type} size="inline"/> : segment}</Fragment>;
  })}</>;
}
