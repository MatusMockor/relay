import type { Ref } from 'react';
import { type DayGroup, hasDayHeader } from '../../lib/day-groups';

export interface DayHeaderProps {
  readonly group: DayGroup;
  readonly index?: number;
  readonly measureRef?: Ref<HTMLDivElement>;
}

export function DayHeader({ group, index, measureRef }: DayHeaderProps) {
  if (!hasDayHeader(group)) {
    return null;
  }
  return (
    <div className="a-day" data-index={index} ref={measureRef}>
      <span className="a-day-label">{group.label}</span>
      {group.date === null ? null : <span className="a-day-date">{group.date}</span>}
    </div>
  );
}
