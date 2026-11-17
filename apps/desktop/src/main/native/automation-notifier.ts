import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import type { NotificationPresenter } from './new-mail-notifier';

export class AutomationNotifier {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly hub: EventHub<RealtimeEvent>,
    private readonly presenter: NotificationPresenter,
  ) {}

  start(): void {
    this.unsubscribe ??= this.hub.subscribe((event) => {
      if (event.type !== 'automation.notified') {
        return;
      }
      this.presenter.show({
        title: event.data.title,
        body: event.data.body,
        threadId: event.data.threadId,
      });
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
