import type { MailNotification, NotificationPresenter } from './new-mail-notifier';

export interface PauseGate {
  isPaused(): boolean;
}

export class PausableNotificationPresenter implements NotificationPresenter {
  constructor(
    private readonly presenter: NotificationPresenter,
    private readonly gate: PauseGate,
  ) {}

  show(notification: MailNotification): void {
    if (this.gate.isPaused()) {
      return;
    }
    this.presenter.show(notification);
  }
}
