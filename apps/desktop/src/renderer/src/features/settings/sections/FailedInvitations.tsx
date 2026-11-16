import type { FailedInvitation } from '@relay/shared';
import { Button, Status } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { useClient } from '../../../data/hooks/services-context';
import { useFailedInvitations, useRefreshCalendar } from '../../../data/hooks/use-calendar';
import { listTimeLabel } from '../../../lib/dates';
import { plural } from '../../../lib/text';
import { showToast } from '../../../state/toast-store';
import { SettingRow } from '../SettingRow';

const describe = (invitation: FailedInvitation): string => {
  const sender = invitation.from?.name ?? invitation.from?.email ?? 'Neznámy odosielateľ';
  const attempts = `${String(invitation.attempts)} ${plural(invitation.attempts, 'pokus', 'pokusy', 'pokusov')}`;
  const failed = `${attempts}, naposledy ${listTimeLabel(invitation.failedAt, new Date())}`;
  return `${sender} · ${invitation.accountEmail} · ${failed} · ${invitation.lastError ?? 'Neznáma chyba'}`;
};

function FailedInvitationRow({ invitation }: { readonly invitation: FailedInvitation }) {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const [busy, setBusy] = useState(false);
  const ref = { accountId: invitation.accountId, messageId: invitation.messageId };
  const run = (work: () => Promise<string>) => {
    setBusy(true);
    work()
      .then(async (done) => {
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
  const title = invitation.subject ?? 'Správa s pozvánkou už nie je dostupná';
  return (
    <SettingRow title={title} description={describe(invitation)}>
      <Status tone={busy ? 'busy' : 'bad'} label={busy ? 'Spracúva sa' : 'Chyba'} />
      <Button
        disabled={busy}
        onClick={() => {
          run(async () =>
            (await client.retryFailedInvitation(ref)).applied
              ? 'Pozvánka pridaná do kalendára'
              : 'Pozvánku sa ani teraz nepodarilo spracovať, skúsime to znova neskôr',
          );
        }}
      >
        Skúsiť znova
      </Button>
      <Button
        variant="danger"
        disabled={busy}
        onClick={() => {
          run(async () => {
            await client.dismissFailedInvitation(ref);
            return 'Pozvánka zahodená';
          });
        }}
      >
        Zahodiť
      </Button>
    </SettingRow>
  );
}

export function FailedInvitations() {
  const failed = useFailedInvitations();
  const invitations = failed.data ?? [];
  if (invitations.length === 0) {
    return null;
  }
  return (
    <section aria-label="Nespracované pozvánky">
      <h3>Nespracované pozvánky</h3>
      <p className="lead">
        Tieto pozvánky z mailov sa ani po niekoľkých pokusoch nepodarilo pridať do kalendára.
      </p>
      {invitations.map((invitation) => (
        <FailedInvitationRow
          key={`${invitation.accountId}:${invitation.messageId}`}
          invitation={invitation}
        />
      ))}
    </section>
  );
}
