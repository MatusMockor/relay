import { CalendarFeedUrlSchema } from '@relay/shared';
import { Button, Field } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { useClient } from '../../../data/hooks/services-context';
import { useRefreshCalendar } from '../../../data/hooks/use-calendar';
import { showToast } from '../../../state/toast-store';
import { CALENDAR_COLORS, normalizeFeedUrl } from './calendar-colors';

export function CalendarFeedForm() {
  const client = useClient();
  const refresh = useRefreshCalendar();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState<string>(CALENDAR_COLORS[1]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const parsed = CalendarFeedUrlSchema.safeParse(normalizeFeedUrl(url));
    if (!parsed.success) {
      setError('Adresa musí začínať https:// alebo webcal://');
      return;
    }
    setError(null);
    setBusy(true);
    client
      .createCalendarSubscription({ name: name.trim() || 'Kalendár', url: parsed.data, color })
      .then(async (created) => {
        await refresh();
        setName('');
        setUrl('');
        showToast(`Kalendár ${created.name} pridaný`);
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
      className="cal-form"
      aria-label="Pridať kalendár"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field
        label="Názov"
        value={name}
        placeholder="Rodina"
        maxLength={120}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      <Field
        label="Tajná adresa vo formáte iCal"
        value={url}
        type="url"
        required
        placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        onChange={(event) => {
          setUrl(event.target.value);
        }}
      />
      <div className="cal-swatches" role="radiogroup" aria-label="Farba kalendára">
        {CALENDAR_COLORS.map((swatch) => (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={swatch === color}
            aria-label={`Farba ${swatch}`}
            className={`cal-swatch${swatch === color ? ' on' : ''}`}
            style={{ ['--c' as string]: swatch }}
            onClick={() => {
              setColor(swatch);
            }}
          />
        ))}
      </div>
      {error === null ? null : (
        <p className="cal-err" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || url.trim() === ''}>
        {busy ? 'Načítava sa…' : 'Pridať kalendár'}
      </Button>
    </form>
  );
}
