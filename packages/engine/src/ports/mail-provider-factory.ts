import type { AccountCredentials, MailAccount } from '@relay/shared/domain';
import type { MailProvider } from './mail-provider';

export interface MailProviderFactory {
  create(account: MailAccount, credentials: AccountCredentials): MailProvider;
}
