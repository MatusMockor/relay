import type { TaskSystemConnection } from '@relay/shared';
import { Button, FolderIcon, Icon } from '@relay/ui';
import { openTaskSystemSettings, reconnectDraftOf } from './task-system-settings';

export function TaskSystemEmpty() {
  return (
    <div className="zero small">
      <div className="zero-in">
        <span className="zero-ic" aria-hidden="true">
          <FolderIcon name="task" />
        </span>
        <h2>Žiadne otvorené úlohy</h2>
        <p>
          Úlohy priradené tebe, ktoré ešte nie sú hotové, sa tu zobrazia zoradené podľa priority.
        </p>
      </div>
    </div>
  );
}

export function TaskSystemReconnect({
  connection,
  message,
}: {
  readonly connection: TaskSystemConnection | undefined;
  readonly message: string;
}) {
  return (
    <div className="zero small">
      <div className="zero-in" role="alert">
        <span className="zero-ic ts-zero-bad" aria-hidden="true">
          <Icon name="warning" size={18} />
        </span>
        <h2>Pripojenie nefunguje</h2>
        <p>{message}</p>
        {connection === undefined ? null : (
          <div className="go">
            <Button
              variant="primary"
              onClick={() => {
                openTaskSystemSettings(reconnectDraftOf(connection));
              }}
            >
              Znova pripojiť
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskSystemFailure({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="zero small">
      <div className="zero-in" role="alert">
        <span className="zero-ic ts-zero-bad" aria-hidden="true">
          <Icon name="warning" size={18} />
        </span>
        <h2>Úlohy sa nepodarilo načítať</h2>
        <p>{message}</p>
        <div className="go">
          <Button onClick={onRetry}>Skúsiť znova</Button>
        </div>
      </div>
    </div>
  );
}
