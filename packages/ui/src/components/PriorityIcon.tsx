import type { TaskPriority } from '@relay/shared';
import { clsx } from 'clsx';

const FILLED_BARS: Readonly<Record<'high' | 'medium' | 'low', number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

const BARS = [
  { x: 1.5, y: 9, height: 5 },
  { x: 6.5, y: 5.5, height: 8.5 },
  { x: 11.5, y: 2, height: 12 },
] as const;

function Shape({ priority }: { readonly priority: TaskPriority }) {
  if (priority === 'urgent') {
    return (
      <>
        <rect className="prio-box" x="1" y="1" width="14" height="14" rx="3.5" />
        <rect className="prio-mark" x="7.1" y="3.75" width="1.8" height="5.5" rx="0.9" />
        <rect className="prio-mark" x="7.1" y="10.5" width="1.8" height="1.8" rx="0.9" />
      </>
    );
  }
  if (priority === 'none') {
    return <rect className="prio-dash" x="3" y="7.25" width="10" height="1.5" rx="0.75" />;
  }
  return (
    <>
      {BARS.map((bar, index) => (
        <rect
          key={bar.x}
          className={clsx('prio-bar', index < FILLED_BARS[priority] && 'on')}
          x={bar.x}
          y={bar.y}
          width="3"
          height={bar.height}
          rx="1"
        />
      ))}
    </>
  );
}

export interface PriorityIconProps {
  readonly priority: TaskPriority;
  readonly label?: string;
}

export function PriorityIcon({ priority, label }: PriorityIconProps) {
  return (
    <svg
      className={clsx('prio', `prio-${priority}`)}
      viewBox="0 0 16 16"
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
    >
      {label === undefined ? null : <title>{label}</title>}
      <Shape priority={priority} />
    </svg>
  );
}
