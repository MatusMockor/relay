import type { TaskSystemConnection } from '@relay/shared';
import { Icon } from '@relay/ui';
import {
  useTaskSystemConnections,
  useTaskSystemTaskLists,
} from '../../data/hooks/use-task-systems';
import { folderKey, taskSystemFolder } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { selectFolder } from '../mail/navigation';
import { openTasksOf } from '../task-systems/open-tasks';
import { ProviderMark } from '../task-systems/ProviderMark';
import { openTaskSystemSettings } from '../task-systems/task-system-settings';
import { SidebarSection } from './SidebarSection';

interface TaskSystemItemProps {
  readonly connection: TaskSystemConnection;
  readonly count: number | null;
}

function TaskSystemItem({ connection, count }: TaskSystemItemProps) {
  const folder = taskSystemFolder(connection.id);
  const on = useUiStore((state) => folderKey(state.folder) === folderKey(folder));
  const failed = connection.status === 'error';
  return (
    <button
      type="button"
      className={`f ts-f${on ? ' on' : ''}`}
      title={failed ? (connection.lastError ?? 'Pripojenie nefunguje') : connection.siteUrl}
      aria-current={on ? 'page' : undefined}
      onClick={() => {
        selectFolder(folder);
      }}
    >
      <ProviderMark provider={connection.provider} />
      <span className="fl">{connection.label}</span>
      {failed ? (
        <span className="ts-warn" role="img" aria-label="Chyba pripojenia">
          <Icon name="warning" size={12} />
        </span>
      ) : null}
      {!failed && count !== null && count > 0 ? <span className="n">{count}</span> : null}
    </button>
  );
}

export function TaskSystemFolders() {
  const connections = useTaskSystemConnections().data ?? [];
  const lists = useTaskSystemTaskLists(connections);
  if (connections.length === 0) {
    return null;
  }
  return (
    <SidebarSection Heading="h5" title="Task systémy" collapseKey="sec:task-systems">
      {connections.map((connection, index) => {
        const data = lists[index]?.data;
        return (
          <TaskSystemItem
            key={connection.id}
            connection={connection}
            count={data === undefined ? null : openTasksOf(data).length}
          />
        );
      })}
      <button
        type="button"
        className="f ts-add"
        onClick={() => {
          openTaskSystemSettings();
        }}
      >
        <Icon name="plus" size={14} />
        <span className="fl">Pripojiť systém</span>
      </button>
    </SidebarSection>
  );
}
