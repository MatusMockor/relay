import type { EventPublisher } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { DomainEventBus } from './domain-event-bus';

export class BusEventPublisher implements EventPublisher {
  constructor(private readonly bus: DomainEventBus) {}

  publish(userId: UserId, event: RealtimeEvent): Promise<void> {
    return this.bus.emit(userId, event);
  }
}
