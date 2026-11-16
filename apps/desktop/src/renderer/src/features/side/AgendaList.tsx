import type { CalendarOccurrence } from '@relay/shared';
import { Fragment } from 'react';
import { hm } from '../../lib/dates';
import { AgendaRow } from './AgendaRow';
import { GoogleEventActions } from './GoogleEventActions';

function NowLine({ now }: { readonly now: Date }) {
  return (
    <div className="now" aria-label={`Teraz ${hm(now)}`}>
      <span>{hm(now)}</span>
      <i />
    </div>
  );
}

const byStart = (a: CalendarOccurrence, b: CalendarOccurrence): number =>
  Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start);

export function AgendaList({
  occurrences,
  base,
  offset,
  now,
}: {
  readonly occurrences: readonly CalendarOccurrence[];
  readonly base: Date;
  readonly offset: number;
  readonly now: Date;
}) {
  const sorted = [...occurrences].sort(byStart);
  const today = offset === 0;
  const nowIndex = sorted.findIndex(
    (occurrence) => !occurrence.allDay && Date.parse(occurrence.start) > now.getTime(),
  );
  const lineAt = !today ? -1 : nowIndex === -1 ? sorted.length : nowIndex;
  return (
    <div className="agenda">
      {sorted.map((occurrence, index) => (
        <Fragment key={occurrence.id}>
          {index === lineAt ? <NowLine now={now} /> : null}
          <AgendaRow
            occurrence={occurrence}
            base={base}
            offset={offset}
            past={today && !occurrence.allDay && Date.parse(occurrence.end) <= now.getTime()}
          />
          <GoogleEventActions occurrence={occurrence} />
        </Fragment>
      ))}
      {lineAt === sorted.length ? <NowLine now={now} /> : null}
    </div>
  );
}
