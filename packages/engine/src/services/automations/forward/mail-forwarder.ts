import type { EmailAddress, Message, UserId } from '@relay/shared/domain';

export interface MailForwarder {
  forward(userId: UserId, message: Message, to: EmailAddress): Promise<void>;
}

export class DeferredMailForwarder implements MailForwarder {
  private target: MailForwarder | null = null;

  bind(target: MailForwarder): void {
    this.target = target;
  }

  forward(userId: UserId, message: Message, to: EmailAddress): Promise<void> {
    if (this.target === null) {
      return Promise.reject(new Error('The mail forwarder is not ready yet'));
    }
    return this.target.forward(userId, message, to);
  }
}
