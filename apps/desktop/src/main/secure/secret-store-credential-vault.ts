import type { CredentialVault } from '@relay/engine';
import {
  type AccountCredentials,
  AccountCredentialsSchema,
  type AccountId,
} from '@relay/shared/domain';
import { parseJsonOrNull } from '../storage/parse-json';
import type { SecretStore } from './secret-store';

export class SecretStoreCredentialVault implements CredentialVault {
  constructor(private readonly store: SecretStore) {}

  async get(accountId: AccountId): Promise<AccountCredentials | null> {
    const raw = await this.store.get(accountId);
    if (raw === null) {
      return null;
    }
    const parsed = AccountCredentialsSchema.safeParse(parseJsonOrNull(raw));
    if (!parsed.success) {
      return null;
    }
    return parsed.data;
  }

  async set(accountId: AccountId, credentials: AccountCredentials): Promise<void> {
    await this.store.set(accountId, JSON.stringify(AccountCredentialsSchema.parse(credentials)));
  }

  async delete(accountId: AccountId): Promise<void> {
    await this.store.delete(accountId);
  }
}
