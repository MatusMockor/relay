import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import { DEFAULT_INVITE_BACKFILL_BATCH, InviteBackfill } from './invite-backfill';
import { InviteIngestor } from './invite-ingestor';
import { InviteQueue } from './invite-queue';
import { InviteSink } from './invite-sink';
import { InviteWorkProcessor } from './invite-work-processor';

export interface InviteComponents {
  readonly sink: InviteSink;
  readonly backfill: InviteBackfill;
}

export type InviteEngineDeps = Pick<
  EngineDeps,
  | 'repositories'
  | 'unitOfWork'
  | 'calendar'
  | 'messageParser'
  | 'clock'
  | 'idGenerator'
  | 'logger'
  | 'options'
>;

export const createInviteComponents = (
  deps: InviteEngineDeps,
  events: EngineEvents,
): InviteComponents => {
  const { repositories, unitOfWork, clock } = deps;
  const logger = deps.logger.child({ component: 'calendar-invites' });
  const queue = new InviteQueue(clock);
  const processor = new InviteWorkProcessor({
    pendingWork: repositories.pendingWork,
    unitOfWork,
    ingestor: new InviteIngestor({ parser: deps.calendar.parser, clock, ids: deps.idGenerator }),
    events,
    clock,
    logger,
  });
  return {
    sink: new InviteSink(queue, processor),
    backfill: new InviteBackfill({
      repositories,
      unitOfWork,
      parser: deps.messageParser,
      queue,
      logger,
      batchSize: deps.options.calendar?.inviteBackfillBatch ?? DEFAULT_INVITE_BACKFILL_BATCH,
    }),
  };
};
