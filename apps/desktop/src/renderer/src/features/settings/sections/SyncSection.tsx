import { Button } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { useClient } from '../../../data/hooks/services-context';
import { useAccounts } from '../../../data/hooks/use-mail-queries';
import { listTimeLabel } from '../../../lib/dates';
import { showToast } from '../../../state/toast-store';
import { setUi } from '../../../state/ui-store';
import { SettingRow } from '../SettingRow';
import { SectionHeader } from '../SectionHeader';

export function SyncSection() {
  const accounts = useAccounts();
  const client = useClient();
  const [busy, setBusy] = useState(false);
  const list = accounts.data ?? [];
  const summary = list
    .map(
      (account) =>
        `${account.displayName} ${String(Math.round(account.syncIntervalSeconds / 60))} min`,
    )
    .join(', ');
  const last = list
    .map((account) => account.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  return (
    <>
      <SectionHeader title="Synchronizácia">
        {client.kind === 'remote'
          ? 'Server sa pozerá na nové maily nepretržite cez IMAP IDLE.'
          : 'Appka sa pozerá na nové maily, kým beží.'}
      </SectionHeader>
      <SettingRow
        title="Interval"
        scope="synced"
        description={
          list.length === 0 ? 'Zatiaľ žiadny účet' : `Každý účet má vlastný interval: ${summary}.`
        }
      >
        <Button
          onClick={() => {
            setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
          }}
        >
          Upraviť v Účtoch
        </Button>
      </SettingRow>
      <SettingRow
        title="Skontrolovať teraz"
        description={
          last === undefined ? 'Ešte neprebehla' : `Naposledy ${listTimeLabel(last, new Date())}`
        }
      >
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            client
              .syncNow()
              .then(() => {
                showToast(
                  client.kind === 'remote' ? 'Server kontroluje poštu…' : 'Pošta je skontrolovaná',
                );
              })
              .catch((error: unknown) => {
                showToast(describeError(error));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          {busy ? 'Kontrolujem…' : 'Skontrolovať teraz'}
        </Button>
      </SettingRow>
    </>
  );
}
