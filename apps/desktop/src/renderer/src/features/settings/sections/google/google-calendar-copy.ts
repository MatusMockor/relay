import type {
  CalendarConnectionStatus,
  GoogleCalendar,
  GoogleCalendarConnection,
} from '@relay/shared';
import { listTimeLabel } from '../../../../lib/dates';

type Tone = 'ok' | 'bad' | 'busy';

export const CONNECTION_STATUS: Readonly<
  Record<CalendarConnectionStatus, { readonly tone: Tone; readonly label: string }>
> = {
  pending: { tone: 'busy', label: 'Synchronizuje sa' },
  ok: { tone: 'ok', label: 'Pripojený' },
  error: { tone: 'bad', label: 'Chyba' },
  reauthorize: { tone: 'bad', label: 'Treba znova pripojiť' },
};

const ROLE_LABEL: Readonly<Record<GoogleCalendar['accessRole'], string>> = {
  owner: 'vlastník',
  writer: 'môžeš upravovať',
  reader: 'len na čítanie',
  freeBusyReader: 'len obsadenosť',
};

export const describeConnection = (connection: GoogleCalendarConnection, now: Date): string => {
  if (connection.lastError !== null) {
    return connection.lastError;
  }
  const linked = connection.accountId === null ? 'samostatný kalendár' : 'spolu s Gmailom';
  if (connection.lastSyncedAt === null) {
    return `${linked} · čaká na prvú synchronizáciu`;
  }
  return `${linked} · synchronizované ${listTimeLabel(connection.lastSyncedAt, now)}`;
};

export const describeCalendar = (calendar: GoogleCalendar): string => {
  const parts = [
    calendar.primary ? 'hlavný kalendár' : null,
    ROLE_LABEL[calendar.accessRole],
    calendar.status === 'error' ? (calendar.lastError ?? 'synchronizácia zlyhala') : null,
    calendar.enabled ? null : 'skrytý',
  ];
  return parts.filter((part) => part !== null).join(' · ');
};
