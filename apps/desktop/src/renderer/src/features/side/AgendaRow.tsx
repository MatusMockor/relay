import type { CalendarOccurrence } from '@relay/shared';
import { openThread } from '../mail/navigation';
import { startLabel, untilLabel } from '../calendar/calendar-time';

const STATUS_NOTE: Partial<Record<NonNullable<CalendarOccurrence['myStatus']>, string>> = {
  'needs-action': 'čaká na odpoveď',
  tentative: 'možno',
  declined: 'odmietnuté',
};

const detailOf = (occurrence: CalendarOccurrence): string =>
  [
    untilLabel(occurrence),
    occurrence.location ?? occurrence.organizer?.name ?? occurrence.organizer?.email ?? null,
    occurrence.myStatus === null ? null : (STATUS_NOTE[occurrence.myStatus] ?? null),
  ]
    .filter((part) => part !== null && part !== '')
    .join(' · ');

export function AgendaRow({
  occurrence,
  base,
  offset,
  past,
}: {
  readonly occurrence: CalendarOccurrence;
  readonly base: Date;
  readonly offset: number;
  readonly past: boolean;
}) {
  const className = [
    'ev',
    past ? 'past' : null,
    occurrence.myStatus === 'declined' ? 'declined' : null,
    occurrence.myStatus === 'needs-action' || occurrence.myStatus === 'tentative'
      ? 'pending'
      : null,
  ]
    .filter((part) => part !== null)
    .join(' ');
  const inner = (
    <>
      <time>{startLabel(occurrence, base, offset)}</time>
      <span className="eb">
        <b>{occurrence.title === '' ? '(bez názvu)' : occurrence.title}</b>
        <span>{detailOf(occurrence)}</span>
      </span>
    </>
  );
  const style = { ['--c' as string]: occurrence.color };
  const { threadId } = occurrence;
  if (threadId === null) {
    return (
      <div className={className} style={style}>
        {inner}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      title="Otvoriť súvisiaci mail"
      onClick={() => {
        openThread(threadId);
      }}
    >
      {inner}
    </button>
  );
}
