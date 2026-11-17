import type { CalendarSubscription } from '@relay/shared';
import { Button, Status } from '@relay/ui';
import { describeError } from '../../../data/errors';
import { useClient } from '../../../data/hooks/services-context';
import { useCalendarSubscriptions, useRefreshCalendar } from '../../../data/hooks/use-calendar';
import { listTimeLabel } from '../../../lib/dates';
import { plural } from '../../../lib/text';
import { useSessionStore } from '../../../session/session-store';
import { showToast } from '../../../state/toast-store';
import { SettingRow } from '../SettingRow';
import { CalendarFeedForm } from './CalendarFeedForm';
import { FailedInvitations } from './FailedInvitations';
import { GoogleCalendarPanel } from './google/GoogleCalendarPanel';
import { nextColor } from './calendar-colors';
import { SectionHeader } from '../SectionHeader';

const describe = (subscription: CalendarSubscription): string => {
  if (subscription.status === 'error') {
    return `${subscription.host} · ${subscription.lastError ?? 'Načítanie zlyhalo'}`;
  }
  if (subscription.status === 'pending' || subscription.lastSyncedAt === null) {
    return `${subscription.host} · čaká na prvé načítanie`;
  }
  const count = subscription.eventCount;
  return `${subscription.host} · ${String(count)} ${plural(count, 'udalosť', 'udalosti', 'udalostí')} · ${listTimeLabel(subscription.lastSyncedAt, new Date())}`;
};

function SubscriptionRow({ subscription }: { readonly subscription: CalendarSubscription }) {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const run = (work: () => Promise<unknown>, done: string) => {
    work()
      .then(async () => {
        await refresh();
        showToast(done);
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
      });
  };
  return (
    <SettingRow title={subscription.name} description={describe(subscription)} scope="synced">
      <button
        type="button"
        className="cal-swatch on"
        style={{ ['--c' as string]: subscription.color }}
        title="Zmeniť farbu"
        aria-label={`Zmeniť farbu kalendára ${subscription.name}`}
        onClick={() => {
          run(
            () =>
              client.updateCalendarSubscription(subscription.id, {
                color: nextColor(subscription.color),
              }),
            'Farba zmenená',
          );
        }}
      />
      <Status
        tone={
          subscription.status === 'ok' ? 'ok' : subscription.status === 'error' ? 'bad' : 'busy'
        }
        label={
          subscription.status === 'ok'
            ? 'Aktívny'
            : subscription.status === 'error'
              ? 'Chyba'
              : 'Načítava sa'
        }
      />
      <Button
        onClick={() => {
          run(() => client.refreshCalendarSubscription(subscription.id), 'Kalendár obnovený');
        }}
      >
        Obnoviť
      </Button>
      <Button
        variant="danger"
        onClick={() => {
          run(() => client.removeCalendarSubscription(subscription.id), 'Kalendár odstránený');
        }}
      >
        Odstrániť
      </Button>
    </SettingRow>
  );
}

export function CalendarsSection() {
  const demo = useSessionStore((state) => state.services?.mode === 'demo');
  const subscriptions = useCalendarSubscriptions();
  return (
    <>
      <SectionHeader title="Kalendáre" stored>
        Pozvánky z mailov sa do kalendára pridávajú samé.
      </SectionHeader>
      <FailedInvitations />
      {demo ? null : <GoogleCalendarPanel />}
      <h3>Kalendáre cez iCal adresu</h3>
      <p className="lead">
        Ďalší kalendár pridáš cez jeho tajnú adresu vo formáte iCal, napríklad z Outlooku. Relay ho
        len číta a adresu ukladá šifrovane.
      </p>
      {(subscriptions.data ?? []).map((subscription) => (
        <SubscriptionRow key={subscription.id} subscription={subscription} />
      ))}
      {demo ? (
        <p className="lead">V ukážkovom režime sa kalendáre nedajú pridávať.</p>
      ) : (
        <CalendarFeedForm />
      )}
    </>
  );
}
