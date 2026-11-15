import type { EventPublisher } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from './event-hub';

export class HubEventPublisher implements EventPublisher {
  constructor(private readonly hub: EventHub<RealtimeEvent>) {}

  publish(_userId: UserId, event: RealtimeEvent): Promise<void> {
    this.hub.publish(event);
    return Promise.resolve();
  }
}
