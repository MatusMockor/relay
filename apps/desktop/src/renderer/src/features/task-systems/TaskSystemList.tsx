import type { ExternalTaskList, TaskSystemConnectionId } from '@relay/shared';
import { describeError, MailClientError } from '../../data/errors';
import { useTaskSystemConnection, useTaskSystemTasks } from '../../data/hooks/use-task-systems';
import { folderKey } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { PriorityGroupHeader } from '../tasks/PriorityGroupHeader';
import { groupTasks, openTasksOf, taskKeyOf } from './open-tasks';
import { selectedTaskKey } from './task-selection';
import { TaskSystemRow } from './TaskSystemRow';
import { TaskSystemEmpty, TaskSystemFailure, TaskSystemReconnect } from './TaskSystemStates';
import { useOpenTask } from './use-open-task';

const isRejected = (error: Error | null): boolean =>
  error instanceof MailClientError && error.code === 'forbidden';

function TaskGroups({ list }: { readonly list: ExternalTaskList }) {
  const stored = useUiStore((state) => state.selected[folderKey(state.folder)]);
  const openTask = useOpenTask();
  const tasks = openTasksOf(list);
  const groups = groupTasks(tasks);
  const selectedKey = selectedTaskKey(
    groups.flatMap((group) => group.items),
    stored,
  );
  const now = new Date();
  return (
    <div className="a-list ts-list">
      <div role="listbox" aria-label="Úlohy">
        {groups.map((group) => (
          <div key={group.priority} className="ts-group" role="group" aria-label={group.label}>
            <PriorityGroupHeader
              priority={group.priority}
              label={group.label}
              count={group.items.length}
            />
            {group.items.map((task) => (
              <TaskSystemRow
                key={taskKeyOf(task)}
                task={task}
                selected={taskKeyOf(task) === selectedKey}
                now={now}
                onOpen={openTask}
              />
            ))}
          </div>
        ))}
      </div>
      {list.truncated ? (
        <p className="ts-note">Zobrazujú sa len prvé úlohy. Ďalšie nájdeš priamo v systéme.</p>
      ) : null}
    </div>
  );
}

export function TaskSystemList({
  connectionId,
}: {
  readonly connectionId: TaskSystemConnectionId;
}) {
  const connection = useTaskSystemConnection(connectionId);
  const tasks = useTaskSystemTasks(connectionId);
  const broken = connection?.status === 'error' && tasks.data === undefined;
  if (isRejected(tasks.error) || broken) {
    const message = connection?.lastError ?? describeError(tasks.error);
    return (
      <div className="a-list">
        <TaskSystemReconnect connection={connection} message={message} />
      </div>
    );
  }
  if (tasks.isPending) {
    return <div className="a-list" aria-busy="true" />;
  }
  if (tasks.isError) {
    return (
      <div className="a-list">
        <TaskSystemFailure
          message={describeError(tasks.error)}
          onRetry={() => {
            void tasks.refetch();
          }}
        />
      </div>
    );
  }
  if (openTasksOf(tasks.data).length === 0) {
    return (
      <div className="a-list">
        <TaskSystemEmpty />
      </div>
    );
  }
  return <TaskGroups list={tasks.data} />;
}
