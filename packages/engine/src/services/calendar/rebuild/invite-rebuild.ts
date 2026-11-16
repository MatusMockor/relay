import type { Mailbox } from '@relay/shared/domain';
import type { CalendarRebuildPartWork, PendingWork } from '../../../model/pending-work';
import type { Logger } from '../../../ports/logger';
import type { Repositories } from '../../../ports/repositories';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import type { EngineEvents } from '../../shared/engine-events';
import { errorMessage } from '../../shared/mail-provider-sessions';
import type { SyncBackfill } from '../../sync/sync-backfill';
import type { SyncContext } from '../../sync/sync-context';
import type { InviteIngestor } from '../invite-ingestor';
import type { RebuildCollector } from './rebuild-collector';
import type { SeriesRebuilder } from './series-rebuilder';

export interface InviteRebuildDeps {
  readonly repositories: Pick<Repositories, 'pendingWork'>;
  readonly unitOfWork: UnitOfWork;
  readonly collector: RebuildCollector;
  readonly rebuilder: SeriesRebuilder;
  readonly ingestor: InviteIngestor;
  readonly events: EngineEvents;
  readonly logger: Logger;
}

type RebuildPart = PendingWork<'calendar-rebuild-part'>;

interface ReplayOutcome {
  readonly changed: boolean;
  readonly failed: number;
}

const MAX_FAILED_REPLAYS = 3;

const byArrival = (a: RebuildPart, b: RebuildPart): number =>
  Date.parse(a.payload.date) - Date.parse(b.payload.date) ||
  a.payload.messageId.localeCompare(b.payload.messageId);

export class InviteRebuild implements SyncBackfill {
  constructor(private readonly deps: InviteRebuildDeps) {}

  async run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void> {
    const { pendingWork } = this.deps.repositories;
    const cursors = await pendingWork.list(context.account.id, 'calendar-rebuild');
    if (cursors.length === 0) {
      return;
    }
    try {
      if (!(await this.deps.collector.collect(context, mailboxes, cursors))) {
        return;
      }
      const parts = await pendingWork.list(context.account.id, 'calendar-rebuild-part');
      const outcome = await this.replay(context, parts.sort(byArrival));
      if (outcome.changed) {
        await this.deps.events.emit(context.userId, 'calendar.updated', {
          sourceKind: 'invite',
          sourceId: context.account.id,
        });
      }
      await this.finish(context, parts, outcome.failed);
    } catch (error) {
      this.deps.logger.warn('Calendar invitation rebuild paused', {
        accountId: context.account.id,
        error: errorMessage(error),
      });
    }
  }

  private async finish(
    context: SyncContext,
    parts: readonly RebuildPart[],
    failed: number,
  ): Promise<void> {
    const { pendingWork } = this.deps.repositories;
    const cursors = await pendingWork.list(context.account.id, 'calendar-rebuild');
    const attempts = Math.max(0, ...cursors.map((cursor) => cursor.payload.failedReplays ?? 0)) + 1;
    if (failed > 0 && attempts < MAX_FAILED_REPLAYS) {
      for (const { revision: _revision, ...cursor } of cursors) {
        await pendingWork.put({
          ...cursor,
          payload: { ...cursor.payload, failedReplays: attempts },
        });
      }
      return;
    }
    await pendingWork.remove([...cursors, ...parts]);
  }

  private async replay(
    context: SyncContext,
    parts: readonly RebuildPart[],
  ): Promise<ReplayOutcome> {
    const bySeries = new Map<string, CalendarRebuildPartWork[]>();
    for (const part of parts) {
      for (const uid of this.deps.ingestor.uidsOf(part.payload.parts)) {
        bySeries.set(uid, [...(bySeries.get(uid) ?? []), part.payload]);
      }
    }
    let changed = false;
    let failed = 0;
    for (const [uid, arrivals] of bySeries) {
      const result = await this.series(context, uid, arrivals);
      changed = result === true || changed;
      failed += result === null ? 1 : 0;
    }
    return { changed, failed };
  }

  private async series(
    context: SyncContext,
    uid: string,
    arrivals: readonly CalendarRebuildPartWork[],
  ): Promise<boolean | null> {
    try {
      return await this.deps.unitOfWork.run((repositories) =>
        this.deps.rebuilder.rebuild(repositories, context.userId, context.account, uid, arrivals),
      );
    } catch (error) {
      this.deps.logger.warn('Calendar series could not be rebuilt', {
        accountId: context.account.id,
        uid,
        error: errorMessage(error),
      });
      return null;
    }
  }
}
