import type { UserId } from '@relay/shared/domain';
import type { GoogleEventRecord } from '../../model/google-calendar';
import type { GoogleEventRepository } from '../../ports/google-calendar-repositories';
import { effectiveEvent, type SeriesMembership } from '../calendar/effective-event';

export const effectiveGoogleEvent = async (
  events: Pick<GoogleEventRepository, 'findByUid'>,
  membership: SeriesMembership,
  userId: UserId,
  record: GoogleEventRecord,
): Promise<GoogleEventRecord> => {
  const series = (await events.findByUid(userId, record.event.uid))
    .filter((copy) => copy.calendarId === record.calendarId)
    .map((copy) => copy.event);
  return { ...record, event: effectiveEvent(record.event, series, membership) };
};
