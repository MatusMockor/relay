import { Inject, Injectable } from '@nestjs/common';
import { type Logger, PORT_TOKENS } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';

export type DomainEventListener = (userId: UserId, event: RealtimeEvent) => void | Promise<void>;

@Injectable()
export class DomainEventBus {
  private readonly listeners = new Set<DomainEventListener>();

  constructor(@Inject(PORT_TOKENS.Logger) private readonly logger: Logger) {}

  subscribe(listener: DomainEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async emit(userId: UserId, event: RealtimeEvent): Promise<void> {
    await Promise.all([...this.listeners].map((listener) => this.deliver(listener, userId, event)));
  }

  private async deliver(
    listener: DomainEventListener,
    userId: UserId,
    event: RealtimeEvent,
  ): Promise<void> {
    try {
      await listener(userId, event);
    } catch (error) {
      this.logger.error('Domain event listener failed', { type: event.type, error });
    }
  }
}
