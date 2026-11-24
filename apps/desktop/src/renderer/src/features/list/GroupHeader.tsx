import { PriorityIcon } from '@relay/ui';
import type { Ref } from 'react';
import { DayHeader } from './DayHeader';
import type { ListGroup } from './grouping';

export interface GroupHeaderProps {
  readonly group: ListGroup;
  readonly index?: number;
  readonly measureRef?: Ref<HTMLDivElement>;
}

export function GroupHeader({ group, index, measureRef }: GroupHeaderProps) {
  if (group.priority === undefined) {
    return <DayHeader group={group} index={index} measureRef={measureRef} />;
  }
  return (
    <div className="a-day a-prio" data-index={index} ref={measureRef}>
      <PriorityIcon priority={group.priority} />
      <span className="a-day-label">{group.label}</span>
      <span className="a-day-date">{group.items.length}</span>
    </div>
  );
}
