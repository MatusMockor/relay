import type { ExternalTask, ExternalTaskList, TaskSystemConnectionId } from '@relay/shared';
import { folderKey } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { PriorityGroupHeader } from '../tasks/PriorityGroupHeader';
import { groupTasks, taskKeyOf } from './open-tasks';
import { selectedTaskKey } from './task-selection';
import { TaskSystemRow } from './TaskSystemRow';
import { TaskSystemEmpty, TaskSystemFailure, TaskSystemReconnect } from './TaskSystemStates';
import { useOpenTask } from './use-open-task';
import { useTaskListView } from './use-task-list-view';

function TaskGroups({
  list,
  tasks,
}: {
  readonly list: ExternalTaskList;
  readonly tasks: readonly ExternalTask[];
}) {
  const stored = useUiStore((state) => state.selected[folderKey(state.folder)]);
  const openTask = useOpenTask();
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
  const { connection, view, refetch } = useTaskListView(connectionId);
  if (view.kind === 'reconnect') {
    return (
      <div className="a-list">
        <TaskSystemReconnect connection={connection} message={view.message} />
      </div>
    );
  }
  if (view.kind === 'loading') {
    return <div className="a-list" aria-busy="true" />;
  }
  if (view.kind === 'failure') {
    return (
      <div className="a-list">
        <TaskSystemFailure
          message={view.message}
          onRetry={() => {
            void refetch();
          }}
        />
      </div>
    );
  }
  if (view.tasks.length === 0) {
    return (
      <div className="a-list">
        <TaskSystemEmpty />
      </div>
    );
  }
  return <TaskGroups list={view.list} tasks={view.tasks} />;
}
