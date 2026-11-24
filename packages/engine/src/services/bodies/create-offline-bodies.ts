import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import type { ChangeFlusher } from '../sync/change-flusher';
import { BodyHydrator } from './body-hydrator';
import { BodyRetention } from './body-retention';
import { HydrationParse } from './hydration-parse';
import { HydrationSkips } from './hydration-skips';
import { DEFAULT_OFFLINE_BODY_OPTIONS, type OfflineBodyOptions } from './offline-body-options';
import { OfflineStatsReader } from './offline-stats-reader';

export const offlineBodyOptions = (deps: EngineDeps): OfflineBodyOptions => ({
  ...DEFAULT_OFFLINE_BODY_OPTIONS,
  ...deps.options.offlineBodies,
});

export const createBodyHydrator = (
  deps: EngineDeps,
  flusher: ChangeFlusher,
): BodyHydrator | null => {
  const store = deps.messageBodies;
  const policy = deps.offlineWindow;
  if (store === undefined || policy === undefined) {
    return null;
  }
  const options = offlineBodyOptions(deps);
  return new BodyHydrator({
    store,
    policy,
    parse: new HydrationParse(deps.messageParser, deps.idGenerator),
    skips: new HydrationSkips(options.skipMs, options.maxSkips),
    flusher,
    unitOfWork: deps.unitOfWork,
    clock: deps.clock,
    logger: deps.logger,
    options,
  });
};

export const createBodyRetention = (deps: EngineDeps, events: EngineEvents): BodyRetention =>
  new BodyRetention({
    accounts: deps.repositories.accounts,
    store: deps.messageBodies ?? null,
    policy: deps.offlineWindow ?? null,
    events,
    logger: deps.logger,
    options: offlineBodyOptions(deps),
  });

export const createOfflineStats = (deps: EngineDeps): OfflineStatsReader =>
  new OfflineStatsReader(deps.repositories.accounts, deps.messageBodies ?? null);
