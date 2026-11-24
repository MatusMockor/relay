import type { TaskPriority } from '@relay/shared';
import { PriorityIcon } from '@relay/ui';
import type { Ref } from 'react';

export interface PriorityGroupHeaderProps {
  readonly priority: TaskPriority;
  readonly label: string;
  readonly count: number;
  readonly index?: number;
  readonly measureRef?: Ref<HTMLDivElement>;
}

export function PriorityGroupHeader({
  priority,
  label,
  count,
  index,
  measureRef,
}: PriorityGroupHeaderProps) {
  return (
    <div className="a-day a-prio" data-index={index} ref={measureRef}>
      <PriorityIcon priority={priority} />
      <span className="a-day-label">{label}</span>
      <span className="a-day-date">{count}</span>
    </div>
  );
}
