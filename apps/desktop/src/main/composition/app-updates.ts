import type { Logger } from '@relay/engine';
import { PeriodicRunner } from '../background/periodic-runner';
import type { Timers } from '../platform/timers';
import type { AppUpdater } from '../updates/app-updater';
import { LazyAppUpdater } from '../updates/lazy-app-updater';
import type { UpdateAvailability } from '../updates/update-availability';
import { UpdateService } from '../updates/update-service';

export interface UpdateTiming {
  readonly initialDelayMs: number;
  readonly intervalMs: number;
}

export const UPDATE_TIMING: UpdateTiming = { initialDelayMs: 30_000, intervalMs: 60 * 60_000 };

export interface AppUpdatesInput {
  readonly availability: UpdateAvailability;
  readonly loadUpdater: () => Promise<AppUpdater>;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly timing?: UpdateTiming;
}

export interface AppUpdates {
  readonly service: UpdateService;
  start(): void;
  stop(): void;
}

export const createAppUpdates = (input: AppUpdatesInput): AppUpdates => {
  const timing = input.timing ?? UPDATE_TIMING;
  const service = new UpdateService({
    updater: new LazyAppUpdater(input.loadUpdater),
    availability: input.availability,
    logger: input.logger,
    timers: input.timers,
  });
  const runner = new PeriodicRunner(
    () => service.check(),
    timing.intervalMs,
    input.timers,
    (error) => {
      input.logger.error('The scheduled update check failed', { error });
    },
  );
  return {
    service,
    start: () => {
      if (!input.availability.enabled) {
        input.logger.info('Automatic updates are off', { reason: input.availability.reason });
        return;
      }
      runner.start(timing.initialDelayMs);
    },
    stop: () => {
      runner.stop();
    },
  };
};
