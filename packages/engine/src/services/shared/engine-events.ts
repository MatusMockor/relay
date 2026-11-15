import type { UserId } from '@relay/shared/domain';
import type { RealtimeEventData, RealtimeEventOf, RealtimeEventType } from '@relay/shared/realtime';
import type { Clock } from '../../ports/clock';
import type { EventPublisher } from '../../ports/event-publisher';

export class EngineEvents {
  constructor(
    private readonly publisher: EventPublisher,
    private readonly clock: Clock,
  ) {}

  async emit<Type extends RealtimeEventType>(
    userId: UserId,
    type: Type,
    data: RealtimeEventData<Type>,
  ): Promise<void> {
    const event = { type, at: this.clock.now().toISOString(), data } as RealtimeEventOf<Type>;
    await this.publisher.publish(userId, event);
  }
}
