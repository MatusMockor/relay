import type { MailAccount, UserId } from '@relay/shared/domain';
import type { SentMessage } from '../../model/outgoing-message';

export interface SentCopySink {
  record(userId: UserId, account: MailAccount, sent: SentMessage): Promise<unknown>;
}
