import type { TaskSystemConnection } from '@relay/shared';
import { Button, Status } from '@relay/ui';
import { PROVIDER_NAME } from '../../task-systems/provider-meta';
import { ProviderMark } from '../../task-systems/ProviderMark';

export interface TaskSystemConnectionRowProps {
  readonly connection: TaskSystemConnection;
  readonly onReconnect: (connection: TaskSystemConnection) => void;
  readonly onDisconnect: (connection: TaskSystemConnection) => void;
}

export function TaskSystemConnectionRow({
  connection,
  onReconnect,
  onDisconnect,
}: TaskSystemConnectionRowProps) {
  const failed = connection.status === 'error';
  const account = connection.accountName === '' ? null : ` · ${connection.accountName}`;
  return (
    <section
      className="srow ts-conn"
      aria-label={`${PROVIDER_NAME[connection.provider]} ${connection.label}`}
    >
      <div className="l">
        <b>
          <ProviderMark provider={connection.provider} />
          {connection.label}
        </b>
        <span>
          {connection.siteUrl}
          {account}
        </span>
        {failed && connection.lastError !== null ? (
          <span className="ts-conn-err">{connection.lastError}</span>
        ) : null}
      </div>
      <div className="r">
        <Status tone={failed ? 'bad' : 'ok'} label={failed ? 'Chyba' : 'Pripojené'} />
        {failed ? (
          <Button
            variant="primary"
            onClick={() => {
              onReconnect(connection);
            }}
          >
            Znova pripojiť
          </Button>
        ) : null}
        <Button
          variant="danger"
          onClick={() => {
            onDisconnect(connection);
          }}
        >
          Odpojiť
        </Button>
      </div>
    </section>
  );
}
