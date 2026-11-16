import type { GoogleCalendarRecord } from '../../model/google-calendar';
import type { Clock } from '../../ports/clock';
import type { GoogleCalendarGateway } from '../../ports/google-calendar-adapters';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { GoogleChangeApplier } from './google-change-applier';
import { collectChanges, type CollectedChanges } from './google-event-pages';

export const FULL_SYNC_LOOKBACK_DAYS = 365;
const DAY_MS = 86_400_000;

export interface GoogleEventSyncDeps {
  readonly gateway: GoogleCalendarGateway;
  readonly unitOfWork: UnitOfWork;
  readonly applier: GoogleChangeApplier;
  readonly clock: Clock;
}

type Changes = Extract<CollectedChanges, { kind: 'changes' }>;

export class GoogleEventSync {
  constructor(private readonly deps: GoogleEventSyncDeps) {}

  async sync(calendar: GoogleCalendarRecord): Promise<boolean> {
    if (calendar.syncToken !== null) {
      const incremental = await collectChanges(this.deps.gateway, calendar, {
        syncToken: calendar.syncToken,
        timeMin: null,
      });
      if (incremental.kind === 'changes') {
        return this.store(calendar, incremental, 'incremental');
      }
    }
    const lookback = this.deps.clock.now().getTime() - FULL_SYNC_LOOKBACK_DAYS * DAY_MS;
    const full = await collectChanges(this.deps.gateway, calendar, {
      syncToken: null,
      timeMin: new Date(lookback).toISOString(),
    });
    if (full.kind === 'expired') {
      return false;
    }
    return this.store(calendar, full, 'full');
  }

  private store(
    calendar: GoogleCalendarRecord,
    collected: Changes,
    mode: 'incremental' | 'full',
  ): Promise<boolean> {
    const now = this.deps.clock.now().toISOString();
    return this.deps.unitOfWork.run(async (repositories) => {
      const current = await repositories.googleCalendars.lockForSync(calendar.id);
      if (current === null || !current.enabled || current.syncToken !== calendar.syncToken) {
        return false;
      }
      if (mode === 'incremental') {
        await this.deps.applier.applyIncremental(repositories, current, collected.changes, now);
      }
      if (mode === 'full') {
        await this.deps.applier.replaceAll(repositories, current, collected.changes, now);
      }
      await repositories.googleCalendars.recordSync(calendar.id, {
        status: 'ok',
        lastError: null,
        syncedAt: now,
        syncToken: collected.syncToken,
      });
      return true;
    });
  }
}
