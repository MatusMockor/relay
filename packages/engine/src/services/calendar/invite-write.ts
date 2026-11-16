import { ConflictError } from '../../errors';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { Repositories } from '../../ports/repositories';

export const MAX_INVITE_WRITE_ATTEMPTS = 5;

export class StaleInviteError extends ConflictError {
  constructor() {
    super('The invitation changed while it was being stored');
  }
}

export class SupersededInviteWorkError extends ConflictError {
  constructor() {
    super('The invitation work changed while it was being applied');
  }
}

export const saveCurrent = async (
  repositories: Repositories,
  event: StoredCalendarEvent,
): Promise<StoredCalendarEvent> => {
  const saved = await repositories.calendarEvents.saveIfCurrent(event);
  if (saved === null) {
    throw new StaleInviteError();
  }
  return saved;
};

export const retryStale = async (apply: () => Promise<boolean>): Promise<boolean> => {
  for (let attempt = 1; ; attempt += 1) {
    const outcome = await apply().then(
      (changed) => ({ changed, stale: false }),
      (error: unknown) => {
        if (!(error instanceof StaleInviteError) || attempt >= MAX_INVITE_WRITE_ATTEMPTS) {
          throw error;
        }
        return { changed: true, stale: true };
      },
    );
    if (!outcome.stale) {
      return outcome.changed || attempt > 1;
    }
  }
};
