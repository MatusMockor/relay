import { useOccurrences } from '../../data/hooks/use-calendar';
import { dm, WEEKDAYS, WEEKDAYS_SHORT } from '../../lib/dates';
import { capitalize, plural } from '../../lib/text';
import { useSessionStore } from '../../session/session-store';
import { setUi, useUiStore } from '../../state/ui-store';
import { onDay, startOfDay, weekWindow } from '../calendar/calendar-time';
import { useNow } from '../calendar/use-now';
import { useState } from 'react';
import { IconButton, Icon } from '@relay/ui';
import { AgendaList } from './AgendaList';
import { CalendarEventForm } from './CalendarEventForm';

const titleOf = (offset: number, date: Date): string => {
  if (offset === 0) {
    return 'Dnes';
  }
  if (offset === 1) {
    return 'Zajtra';
  }
  return capitalize(WEEKDAYS[date.getDay()] ?? '');
};

const openCalendarSettings = () => {
  setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
};

export function CalendarPane() {
  const day = useUiStore((state) => state.calendarDay);
  const demo = useSessionStore((state) => state.services?.mode === 'demo');
  const now = useNow();
  const base = startOfDay(now, 0);
  const week = useOccurrences(weekWindow(base));
  const occurrences = (week.data ?? []).filter((occurrence) => occurrence.status !== 'cancelled');
  const date = startOfDay(base, day);
  const events = occurrences.filter((occurrence) => onDay(occurrence, base, day));
  const [creating, setCreating] = useState(false);
  return (
    <div className="spane" role="tabpanel" aria-label="Kalendár">
      <div className="sbody">
        <div className="cal-h">
          <h3>{titleOf(day, date)}</h3>
          <span>{`${capitalize(WEEKDAYS[date.getDay()] ?? '')} ${dm(date)}`}</span>
          {demo ? null : (
            <IconButton
              label="Nová udalosť"
              active={creating}
              onClick={() => {
                setCreating((open) => !open);
              }}
            >
              <Icon name="plus" />
            </IconButton>
          )}
        </div>
        <div className="week">
          {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
            const cell = startOfDay(base, offset);
            const count = occurrences.filter((occurrence) =>
              onDay(occurrence, base, offset),
            ).length;
            const has = count > 0;
            return (
              <button
                key={offset}
                type="button"
                className={`wd${offset === day ? ' on' : ''}${offset === 0 ? ' today' : ''}`}
                aria-label={`${capitalize(WEEKDAYS[cell.getDay()] ?? '')} ${dm(cell)}`}
                aria-pressed={offset === day}
                onClick={() => {
                  setUi({ calendarDay: offset });
                }}
              >
                {WEEKDAYS_SHORT[cell.getDay()]}
                <b>{cell.getDate()}</b>
                <i
                  className={has ? undefined : 'none'}
                  title={`${String(count)} ${plural(count, 'udalosť', 'udalosti', 'udalostí')}`}
                />
              </button>
            );
          })}
        </div>
        {creating ? (
          <CalendarEventForm
            day={date}
            onClose={() => {
              setCreating(false);
            }}
          />
        ) : null}
        {events.length === 0 ? (
          <div className="agenda">
            <div className="ev-empty">
              {week.isError ? 'Kalendár sa nepodarilo načítať.' : 'Žiadne stretnutia.'}
            </div>
          </div>
        ) : (
          <AgendaList occurrences={events} base={base} offset={day} now={now} />
        )}
        {demo ? (
          <p className="cal-foot">Ukážková agenda</p>
        ) : (
          <p className="cal-foot">
            Pozvánky z mailov sa pridávajú samé.{' '}
            <button type="button" className="link" onClick={openCalendarSettings}>
              Pridať kalendár
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
