import type { Ref } from 'react';
import { PriorityGroupHeader } from '../tasks/PriorityGroupHeader';
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
    <PriorityGroupHeader
      priority={group.priority}
      label={group.label}
      count={group.items.length}
      index={index}
      measureRef={measureRef}
    />
  );
}
