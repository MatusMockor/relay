import { type GoogleCalendar, type GoogleCalendarId, isWritableAccessRole } from '@relay/shared';
import { Button, Field, Switch } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { useClient } from '../../data/hooks/services-context';
import { useRefreshCalendar } from '../../data/hooks/use-calendar';
import { useGoogleCalendarOverview } from '../../data/hooks/use-google-calendar';
import { showToast } from '../../state/toast-store';
import { systemTimeZone } from '../calendar/calendar-time';
import { buildEventBody, type EventDraft } from '../calendar/google/event-draft';

const writableCalendars = (calendars: readonly GoogleCalendar[]): GoogleCalendar[] =>
  calendars.filter((calendar) => calendar.enabled && isWritableAccessRole(calendar.accessRole));

const EMPTY: Omit<EventDraft, 'calendarId'> = {
  title: '',
  allDay: false,
  from: '9:00',
  to: '10:00',
  location: '',
  attendees: '',
};

export function CalendarEventForm({
  day,
  onClose,
}: {
  readonly day: Date;
  readonly onClose: () => void;
}) {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const overview = useGoogleCalendarOverview();
  const calendars = writableCalendars(
    (overview.data?.connections ?? []).flatMap((c) => c.calendars),
  );
  const [draft, setDraft] = useState(EMPTY);
  const [chosen, setChosen] = useState<GoogleCalendarId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const calendarId =
    chosen ?? calendars.find((calendar) => calendar.primary)?.id ?? calendars[0]?.id ?? null;
  const set = (patch: Partial<typeof EMPTY>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  if (overview.isSuccess && calendars.length === 0) {
    return (
      <div className="ev-form" role="note">
        <p className="cal-foot">Na vytváranie udalostí pripoj Google kalendár v nastaveniach.</p>
        <Button onClick={onClose}>Zavrieť</Button>
      </div>
    );
  }
  const submit = () => {
    const built = buildEventBody({ ...draft, calendarId }, day, systemTimeZone());
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setBusy(true);
    setError(null);
    client
      .createCalendarEvent(built.body)
      .then(async () => {
        await refresh();
        showToast('Udalosť vytvorená');
        onClose();
      })
      .catch((cause: unknown) => {
        setError(describeError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <form
      className="ev-form"
      aria-label="Nová udalosť"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <Field
        label="Názov"
        value={draft.title}
        autoFocus
        required
        maxLength={500}
        placeholder="Stretnutie"
        onChange={(event) => {
          set({ title: event.target.value });
        }}
      />
      <label className="ev-form-row">
        <span>Celý deň</span>
        <Switch
          checked={draft.allDay}
          label="Celý deň"
          onChange={(allDay) => {
            set({ allDay });
          }}
        />
      </label>
      {draft.allDay ? null : (
        <div className="ev-form-times">
          <Field
            label="Od"
            value={draft.from}
            inputMode="numeric"
            placeholder="9:00"
            onChange={(event) => {
              set({ from: event.target.value });
            }}
          />
          <Field
            label="Do"
            value={draft.to}
            inputMode="numeric"
            placeholder="10:00"
            onChange={(event) => {
              set({ to: event.target.value });
            }}
          />
        </div>
      )}
      <Field
        label="Miesto"
        value={draft.location}
        maxLength={500}
        onChange={(event) => {
          set({ location: event.target.value });
        }}
      />
      <Field
        label="Účastníci"
        value={draft.attendees}
        placeholder="peter@firma.sk, jana@firma.sk"
        onChange={(event) => {
          set({ attendees: event.target.value });
        }}
      />
      {calendars.length > 1 ? (
        <label className="fld">
          <span>Kalendár</span>
          <select
            value={calendarId ?? ''}
            onChange={(event) => {
              setChosen(event.target.value as GoogleCalendarId);
            }}
          >
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {error === null ? null : (
        <p className="cal-err" role="alert">
          {error}
        </p>
      )}
      <div className="ev-form-acts">
        <Button type="submit" variant="primary" disabled={busy || calendarId === null}>
          {busy ? 'Ukladá sa…' : 'Vytvoriť'}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Zrušiť
        </Button>
      </div>
    </form>
  );
}
