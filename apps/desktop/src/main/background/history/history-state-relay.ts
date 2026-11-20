import type { Clock, Logger } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../../events/event-hub';
import type { HistoryProgressSource } from './history-progress-source';

export interface HistoryStateRelayDeps {
  readonly progress: () => HistoryProgressSource;
  readonly hub: EventHub<RealtimeEvent>;
  readonly clock: Clock;
  readonly logger: Logger;
}

export const relayHistoryState =
  (deps: HistoryStateRelayDeps) =>
  (accountId: AccountId): void => {
    deps
      .progress()
      .of(accountId)
      .then((progress) => {
        if (progress === null) {
          return;
        }
        deps.hub.publish({
          type: 'sync.history',
          at: deps.clock.now().toISOString(),
          data: progress,
        });
      })
      .catch((error: unknown) => {
        deps.logger.warn('Failed to publish history state', { accountId, error });
      });
  };
