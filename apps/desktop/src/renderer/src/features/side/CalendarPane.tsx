import { useSessionStore } from '../../session/session-store';
import { atDay, dm, hm, WEEKDAYS, WEEKDAYS_SHORT } from '../../lib/dates';
import { capitalize } from '../../lib/text';
import { setUi, useUiStore } from '../../state/ui-store';
import { minutesOf, SAMPLE_AGENDA } from './calendar-sample';

export function CalendarPane() {
  const day = useUiStore((state) => state.calendarDay);
  const mode = useSessionStore((state) => state.services?.mode);
  const now = new Date();
  const date = atDay(now, day, 0);
  const events = mode === 'demo' ? SAMPLE_AGENDA.filter((event) => event.day === day) : [];
  const nowMinutes = minutesOf(hm(now));
  const title =
    day === 0 ? 'Dnes' : day === 1 ? 'Zajtra' : capitalize(WEEKDAYS[date.getDay()] ?? '');
  return (
    <div className="spane" role="tabpanel" aria-label="Kalendár">
      <div className="sbody">
        <div className="cal-h">
          <h3>{title}</h3>
          <span>{`${capitalize(WEEKDAYS[date.getDay()] ?? '')} ${dm(date)}`}</span>
        </div>
        <div className="week">
          {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
            const cell = atDay(now, offset, 0);
            const has = mode === 'demo' && SAMPLE_AGENDA.some((event) => event.day === offset);
            return (
              <button
                key={offset}
                type="button"
                className={`wd${offset === day ? ' on' : ''}${offset === 0 ? ' today' : ''}`}
                aria-label={`${capitalize(WEEKDAYS[cell.getDay()] ?? '')} ${dm(cell)}`}
                onClick={() => {
                  setUi({ calendarDay: offset });
                }}
              >
                {WEEKDAYS_SHORT[cell.getDay()]}
                <b>{cell.getDate()}</b>
                <i className={has ? undefined : 'none'} />
              </button>
            );
          })}
        </div>
        <div className="agenda">
          {events.length === 0 ? (
            <div className="ev-empty">
              {mode === 'demo'
                ? 'Žiadne stretnutia.'
                : 'Kalendár zatiaľ nie je prepojený. Prepojenie s Google a Outlook kalendárom pribudne v ďalšej verzii.'}
            </div>
          ) : (
            events.map((event) => (
              <div
                key={`${event.start}-${event.title}`}
                className={`ev${day === 0 && minutesOf(event.end) <= nowMinutes ? ' past' : ''}`}
                style={{ ['--c' as string]: event.color }}
              >
                <time>{event.start}</time>
                <span className="eb">
                  <b>{event.title}</b>
                  <span>{`${event.start}-${event.end} · ${event.sub}`}</span>
                </span>
              </div>
            ))
          )}
        </div>
        {mode === 'demo' ? <p className="mono">Ukážková agenda</p> : null}
      </div>
    </div>
  );
}
