import type { UnsubscribeSender } from '../../../src';

export class RecordingUnsubscribeSender implements UnsubscribeSender {
  readonly sent: string[] = [];

  sendOneClick(url: string): Promise<void> {
    this.sent.push(url);
    return Promise.resolve();
  }
}
