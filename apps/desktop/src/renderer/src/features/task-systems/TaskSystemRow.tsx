import type { ExternalTask } from '@relay/shared';
import { cx, PriorityIcon } from '@relay/ui';
import { useEffect } from 'react';
import { scrollOptionIntoView } from '../search/use-active-option-scroll';
import { priorityTitle } from '../tasks/priority-labels';
import { dueLabelOf } from './due-date';
import { taskKeyOf } from './open-tasks';
import { TaskKey } from './TaskKey';

export interface TaskSystemRowProps {
  readonly task: ExternalTask;
  readonly selected: boolean;
  readonly now: Date;
  readonly onOpen: (task: ExternalTask) => void;
}

export function TaskSystemRow({ task, selected, now, onOpen }: TaskSystemRowProps) {
  const id = `ts-row-${taskKeyOf(task)}`;
  const due = task.dueDate === null ? null : dueLabelOf(task.dueDate, now);
  useEffect(() => {
    if (selected) {
      scrollOptionIntoView(id);
    }
  }, [id, selected]);
  return (
    <div
      id={id}
      className={cx('a-row ts-row', selected && 'sel')}
      role="option"
      aria-selected={selected}
      title={task.url}
      onClick={() => {
        onOpen(task);
      }}
    >
      <PriorityIcon priority={task.priority} label={priorityTitle(task.priority)} />
      <TaskKey value={task.key} />
      <span className="line">
        <span className="subj">{task.title}</span>
      </span>
      <span className="ts-meta">
        <span className={`chip ts-st ts-st-${task.status.category}`}>{task.status.name}</span>
        {task.projectName === null ? null : <span className="ts-proj">{task.projectName}</span>}
        {due === null ? null : (
          <time
            className={cx('ts-due', due.late && 'late')}
            dateTime={task.dueDate ?? undefined}
            title={`Termín: ${due.text}`}
          >
            {due.text}
          </time>
        )}
      </span>
    </div>
  );
}
