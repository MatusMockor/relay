import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import { FailedInvitationService } from './failed-invitation-service';
import { DEFAULT_INVITE_BACKFILL_BATCH, InviteBackfill } from './invite-backfill';
import { InviteIngestor } from './invite-ingestor';
import { InviteQueue } from './invite-queue';
import { InviteSink } from './invite-sink';
import { InviteWorkProcessor } from './invite-work-processor';
import { InviteRebuild } from './rebuild/invite-rebuild';
import { RebuildCollector } from './rebuild/rebuild-collector';
import { SeriesRebuilder } from './rebuild/series-rebuilder';
import { type SyncBackfill, SyncBackfills } from '../sync/sync-backfill';

export interface InviteComponents {
  readonly sink: InviteSink;
  readonly backfill: SyncBackfill;
  readonly failed: FailedInvitationService;
}

export type InviteEngineDeps = Pick<
  EngineDeps,
  'repositories' | 'unitOfWork' | 'calendar' | 'clock' | 'idGenerator' | 'logger' | 'options'
>;

export const createInviteComponents = (
  deps: InviteEngineDeps,
  events: EngineEvents,
): InviteComponents => {
  const { repositories, unitOfWork, clock } = deps;
  const logger = deps.logger.child({ component: 'calendar-invites' });
  const queue = new InviteQueue(clock);
  const ingestor = new InviteIngestor({
    parser: deps.calendar.parser,
    expander: deps.calendar.expander,
    clock,
    ids: deps.idGenerator,
  });
  const processor = new InviteWorkProcessor({
    pendingWork: repositories.pendingWork,
    unitOfWork,
    ingestor,
    events,
    clock,
    logger,
  });
  const batchSize = deps.options.calendar?.inviteBackfillBatch ?? DEFAULT_INVITE_BACKFILL_BATCH;
  const sink = new InviteSink(queue, processor);
  return {
    sink,
    backfill: new SyncBackfills([
      new InviteBackfill({ repositories, unitOfWork, queue, logger, batchSize }),
      new InviteRebuild({
        repositories,
        unitOfWork,
        collector: new RebuildCollector({ repositories, unitOfWork, clock, batchSize }),
        rebuilder: new SeriesRebuilder(ingestor, clock),
        ingestor,
        events,
        logger,
      }),
    ]),
    failed: new FailedInvitationService({
      accounts: repositories.accounts,
      messages: repositories.messages,
      pendingWork: repositories.pendingWork,
      invites: sink,
    }),
  };
};
