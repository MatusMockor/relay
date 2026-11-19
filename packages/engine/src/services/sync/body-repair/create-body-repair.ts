import type { EngineDeps } from '../../../engine-deps';
import type { EngineEvents } from '../../shared/engine-events';
import type { SyncBackfill } from '../sync-backfill';
import { BodyRefetcher } from './body-refetcher';
import { DEFAULT_BODY_REPAIR_BATCH, MessageBodyRepair } from './message-body-repair';

export const createBodyRepairBackfills = (
  deps: EngineDeps,
  events: EngineEvents,
): SyncBackfill[] => {
  if (deps.messageBodyRepairs === undefined) {
    return [];
  }
  return [
    new MessageBodyRepair({
      bodies: deps.messageBodyRepairs,
      repositories: deps.repositories,
      unitOfWork: deps.unitOfWork,
      refetcher: new BodyRefetcher(deps.messageParser),
      events,
      logger: deps.logger,
      batchSize: DEFAULT_BODY_REPAIR_BATCH,
    }),
  ];
};
