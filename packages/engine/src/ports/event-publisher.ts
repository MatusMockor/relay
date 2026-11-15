import type { UserId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';

export interface EventPublisher {
  publish(userId: UserId, event: RealtimeEvent): Promise<void>;
}
