import type { Clock, Logger } from '@relay/engine';
import type { NotificationMode, ThreadId, ThreadSummary } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import type { TimerHandle, Timers } from '../platform/timers';

export interface MailNotification {
  readonly title: string;
  readonly body: string;
  readonly threadId: ThreadId | null;
}

export interface NotificationPresenter {
  show(notification: MailNotification): void;
}

export interface NewMailNotifierDeps {
  readonly hub: EventHub<RealtimeEvent>;
  readonly presenter: NotificationPresenter;
  readonly mode: () => Promise<NotificationMode>;
  readonly clock: Clock;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly digestIntervalMs?: number;
}

const DEFAULT_DIGEST_INTERVAL_MS = 15 * 60_000;

const senderOf = (thread: ThreadSummary): string => {
  const [first] = thread.participants;
  if (first === undefined) {
    return 'Nová správa';
  }
  return first.name ?? first.email;
};

const digestBody = (count: number): string => {
  if (count === 1) {
    return 'Máš 1 novú správu';
  }
  if (count < 5) {
    return `Máš ${String(count)} nové správy`;
  }
  return `Máš ${String(count)} nových správ`;
};

export class NewMailNotifier {
  private readonly seen = new Map<ThreadId, number>();
  private readonly digest = new Set<ThreadId>();
  private startedAt = 0;
  private unsubscribe: (() => void) | null = null;
  private digestTimer: TimerHandle | null = null;
  private generation = 0;

  constructor(private readonly deps: NewMailNotifierDeps) {}

  start(): void {
    this.startedAt = this.deps.clock.now().getTime();
    this.unsubscribe ??= this.deps.hub.subscribe((event) => {
      if (event.type !== 'thread.upserted') {
        return;
      }
      this.guard(this.consider(event.data.thread, this.generation));
    });
  }

  stop(): void {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.digestTimer?.cancel();
    this.digestTimer = null;
    this.digest.clear();
  }

  private guard(work: Promise<void>): void {
    work.catch((error: unknown) => {
      this.deps.logger.warn('Failed to show a new mail notification', { error });
    });
  }

  private async consider(thread: ThreadSummary, generation: number): Promise<void> {
    if (!this.isFresh(thread)) {
      return;
    }
    const mode = await this.deps.mode();
    if (generation !== this.generation) {
      return;
    }
    if (mode === 'urgent') {
      this.deps.presenter.show({
        title: senderOf(thread),
        body: thread.subject,
        threadId: thread.id,
      });
      return;
    }
    if (mode === 'digest') {
      this.digest.add(thread.id);
      this.scheduleDigest();
    }
  }

  private isFresh(thread: ThreadSummary): boolean {
    const arrivedAt = Date.parse(thread.lastMessageAt);
    const previous = this.seen.get(thread.id) ?? this.startedAt;
    this.seen.set(thread.id, Math.max(previous, arrivedAt));
    return thread.unread && thread.state === 'inbox' && arrivedAt > previous;
  }

  private scheduleDigest(): void {
    if (this.digestTimer !== null) {
      return;
    }
    const interval = this.deps.digestIntervalMs ?? DEFAULT_DIGEST_INTERVAL_MS;
    this.digestTimer = this.deps.timers.after(interval, () => {
      this.digestTimer = null;
      this.guard(this.flushDigest(this.generation));
    });
  }

  private async flushDigest(generation: number): Promise<void> {
    const count = this.digest.size;
    this.digest.clear();
    if (count === 0 || (await this.deps.mode()) !== 'digest' || generation !== this.generation) {
      return;
    }
    this.deps.presenter.show({ title: 'Relay', body: digestBody(count), threadId: null });
  }
}
