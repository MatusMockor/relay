import type { MessageId } from '@relay/shared/domain';

export class HydrationSkips {
  private readonly until = new Map<MessageId, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly capacity: number,
  ) {}

  add(messageId: MessageId, now: Date): void {
    this.until.delete(messageId);
    this.until.set(messageId, now.getTime() + this.ttlMs);
    const oldest = this.until.keys().next();
    if (this.until.size > this.capacity && oldest.done !== true) {
      this.until.delete(oldest.value);
    }
  }

  active(now: Date): MessageId[] {
    const time = now.getTime();
    [...this.until]
      .filter(([, expiresAt]) => expiresAt <= time)
      .forEach(([messageId]) => {
        this.until.delete(messageId);
      });
    return [...this.until.keys()];
  }
}
