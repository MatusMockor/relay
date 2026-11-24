import type { TaskSystemConnectionId } from '@relay/shared';
import { visibleTasksOf } from './task-list-view';
import { ProviderMark } from './ProviderMark';
import { useTaskListView } from './use-task-list-view';

export function TaskSystemTitle({
  connectionId,
}: {
  readonly connectionId: TaskSystemConnectionId;
}) {
  const { connection, view } = useTaskListView(connectionId);
  const count = visibleTasksOf(view).length;
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
