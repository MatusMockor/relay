import type { TaskSystemConnectionId } from '@relay/shared';
import { useTaskSystemConnection, useTaskSystemTasks } from '../../data/hooks/use-task-systems';
import { openTasksOf } from './open-tasks';
import { ProviderMark } from './ProviderMark';

export function TaskSystemTitle({
  connectionId,
}: {
  readonly connectionId: TaskSystemConnectionId;
}) {
  const connection = useTaskSystemConnection(connectionId);
  const tasks = useTaskSystemTasks(connectionId);
  const count = openTasksOf(tasks.data).length;
  const label = connection?.label ?? 'Task systém';
  return (
    <div className="a-title">
      <h2>
        <ProviderMark provider={connection?.provider ?? 'jira'} />
        <span className="a-tt" title={connection?.siteUrl ?? label}>
          {label}
        </span>
        {count > 0 ? <b>{count}</b> : null}
      </h2>
    </div>
  );
}
