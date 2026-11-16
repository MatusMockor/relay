import type { GoogleCalendarOverview, MailAccount } from '@relay/shared';
import { Button } from '@relay/ui';
import { useAccounts } from '../../../../data/hooks/use-mail-queries';
import { useGoogleCalendarOverview } from '../../../../data/hooks/use-google-calendar';
import { useGoogleCalendarConnect } from '../../../calendar/google/use-google-calendar-connect';
import { GoogleConnectionCard } from './GoogleConnectionCard';

const ungranted = (
  accounts: readonly MailAccount[],
  overview: GoogleCalendarOverview | undefined,
): MailAccount[] => {
  const connected = new Set(
    (overview?.connections ?? []).map((connection) => connection.email.toLowerCase()),
  );
  return accounts.filter(
    (account) => account.provider === 'gmail' && !connected.has(account.email.toLowerCase()),
  );
};

export function GoogleCalendarPanel() {
  const overview = useGoogleCalendarOverview();
  const accounts = useAccounts();
  const connect = useGoogleCalendarConnect();
  const data = overview.data;
  const configured = data?.configured ?? false;
  const waiting = connect.phase === 'waiting';
  return (
    <div className="gcal-panel">
      <h3>Google kalendár</h3>
      <p className="lead">
        Pripoj Google kalendár priamo, s farbami kalendárov a obojsmernou synchronizáciou. Môže byť
        spolu s Gmailom alebo samostatne, napríklad popri pracovnej schránke cez IMAP.
      </p>
      {data !== undefined && !configured ? (
        <p className="cal-hint" role="note">
          {data.setupHint ?? 'Google kalendár nie je nastavený.'}
        </p>
      ) : null}
      {(data?.connections ?? []).map((connection) => (
        <GoogleConnectionCard
          key={connection.id}
          connection={connection}
          onReconnect={connect.start}
        />
      ))}
      <div className="gcal-actions">
        <Button
          variant="primary"
          disabled={!configured || waiting}
          onClick={() => {
            connect.start();
          }}
        >
          {waiting ? 'Čaká sa na prihlásenie v prehliadači…' : 'Pripojiť Google kalendár'}
        </Button>
        {ungranted(accounts.data ?? [], data).map((account) => (
          <Button
            key={account.id}
            disabled={!configured || waiting}
            onClick={() => {
              connect.start(account.email);
            }}
          >
            {`Povoliť kalendár pre ${account.email}`}
          </Button>
        ))}
        {waiting ? (
          <Button variant="ghost" onClick={connect.cancel}>
            Zrušiť
          </Button>
        ) : null}
      </div>
      {connect.error === null ? null : (
        <p className="cal-err" role="alert">
          {connect.error}
        </p>
      )}
    </div>
  );
}
