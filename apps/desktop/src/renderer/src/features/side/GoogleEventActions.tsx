import type { CalendarOccurrence, CalendarRsvpResponse } from '@relay/shared';
import { Button } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { useClient } from '../../data/hooks/services-context';
import { useRefreshCalendar } from '../../data/hooks/use-calendar';
import { showToast } from '../../state/toast-store';

const RESPONSES: readonly { readonly value: CalendarRsvpResponse; readonly label: string }[] = [
  { value: 'accepted', label: 'Prijať' },
  { value: 'tentative', label: 'Možno' },
  { value: 'declined', label: 'Odmietnuť' },
];

const confirmLabel = (occurrence: CalendarOccurrence): string =>
  occurrence.recurrenceId === null ? 'Naozaj zmazať?' : 'Zmazať celú sériu?';

export function GoogleEventActions({ occurrence }: { readonly occurrence: CalendarOccurrence }) {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (occurrence.sourceKind !== 'google' || (!occurrence.canRespond && !occurrence.canDelete)) {
    return null;
  }
  const run = (work: () => Promise<void>, done: string) => {
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
        setConfirming(false);
      });
  };
  const title = occurrence.title === '' ? 'udalosť' : occurrence.title;
  return (
    <div className="ev-acts" role="group" aria-label={`Akcie pre ${title}`}>
      {occurrence.canRespond
        ? RESPONSES.map((response) => (
            <Button
              key={response.value}
              variant={occurrence.myStatus === response.value ? 'primary' : 'ghost'}
              aria-pressed={occurrence.myStatus === response.value}
              disabled={busy}
              onClick={() => {
                run(
                  () => client.respondToCalendarEvent(occurrence.eventId, response.value),
                  'Odpoveď odoslaná',
                );
              }}
            >
              {response.label}
            </Button>
          ))
        : null}
      {occurrence.canDelete ? (
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            run(() => client.deleteCalendarEvent(occurrence.eventId), 'Udalosť zmazaná');
          }}
        >
          {confirming ? confirmLabel(occurrence) : 'Zmazať'}
        </Button>
      ) : null}
    </div>
  );
}
