import type { AccountCredentials, AccountId } from '@relay/shared/domain';

export interface CredentialVault {
  get(accountId: AccountId): Promise<AccountCredentials | null>;
  set(accountId: AccountId, credentials: AccountCredentials): Promise<void>;
  delete(accountId: AccountId): Promise<void>;
}
