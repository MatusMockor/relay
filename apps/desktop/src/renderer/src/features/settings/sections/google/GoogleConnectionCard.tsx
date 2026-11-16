import type { GoogleCalendarConnection } from '@relay/shared';
import { Button, Status } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../../../data/errors';
import { useClient } from '../../../../data/hooks/services-context';
import { useRefreshCalendar } from '../../../../data/hooks/use-calendar';
import { showToast } from '../../../../state/toast-store';
import { SettingRow } from '../../SettingRow';
import { CONNECTION_STATUS, describeConnection } from './google-calendar-copy';
import { GoogleCalendarRow } from './GoogleCalendarRow';

export interface GoogleConnectionCardProps {
  readonly connection: GoogleCalendarConnection;
  readonly onReconnect: (email: string) => void;
}

export function GoogleConnectionCard({ connection, onReconnect }: GoogleConnectionCardProps) {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const [busy, setBusy] = useState(false);
  const run = (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    work()
      .then(async () => {
        await refresh();
        showToast(done);
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const status = CONNECTION_STATUS[connection.status];
  return (
    <section className="gcal" aria-label={`Google kalendár ${connection.email}`}>
      <SettingRow
        title={connection.email}
        description={describeConnection(connection, new Date())}
        scope="synced"
      >
        <Status tone={status.tone} label={status.label} />
        {connection.status === 'reauthorize' ? (
          <Button
            variant="primary"
            onClick={() => {
              onReconnect(connection.email);
            }}
          >
            Pripojiť znova
          </Button>
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              run(
                () => client.syncGoogleCalendar(connection.id),
                'Google kalendár synchronizovaný',
              );
            }}
          >
            Synchronizovať
          </Button>
        )}
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            run(() => client.disconnectGoogleCalendar(connection.id), 'Google kalendár odpojený');
          }}
        >
          Odpojiť
        </Button>
      </SettingRow>
      <div className="gcal-list">
        {connection.calendars.map((calendar) => (
          <GoogleCalendarRow key={calendar.id} calendar={calendar} />
        ))}
      </div>
    </section>
  );
}
