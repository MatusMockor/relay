import type { ConditionalCredentialVault } from '@relay/engine';
import {
  type AccountCredentials,
  AccountCredentialsSchema,
  type AccountId,
} from '@relay/shared/domain';
import { parseJsonOrNull } from '../storage/parse-json';
import type { SecretStore } from './secret-store';

const parse = (raw: string): AccountCredentials | null => {
  const parsed = AccountCredentialsSchema.safeParse(parseJsonOrNull(raw));
  return parsed.success ? parsed.data : null;
};

const serialize = (credentials: AccountCredentials): string =>
  JSON.stringify(AccountCredentialsSchema.parse(credentials));

export class SecretStoreCredentialVault implements ConditionalCredentialVault {
  constructor(private readonly store: SecretStore) {}

  async get(accountId: AccountId): Promise<AccountCredentials | null> {
    const raw = await this.store.get(accountId);
    if (raw === null) {
      return null;
    }
    return parse(raw);
  }

  async set(accountId: AccountId, credentials: AccountCredentials): Promise<void> {
    await this.store.set(accountId, serialize(credentials));
  }

  async setIfUnchanged(
    accountId: AccountId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    const raw = await this.store.get(accountId);
    const current = raw === null ? null : parse(raw);
    if (raw === null || current === null || serialize(current) !== serialize(expected)) {
      return false;
    }
    return this.store.replace(accountId, raw, serialize(next));
  }

  async delete(accountId: AccountId): Promise<void> {
    await this.store.delete(accountId);
  }
}
