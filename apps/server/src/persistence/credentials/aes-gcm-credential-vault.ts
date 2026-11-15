import type { ConditionalCredentialVault } from '@relay/engine';
import {
  type AccountCredentials,
  AccountCredentialsSchema,
  type AccountId,
} from '@relay/shared/domain';
import type { AesGcmCipher } from './aes-gcm-cipher';
import { CredentialDecryptionError } from './credential-decryption-error';
import type { PgAccountCredentialStore } from './pg-account-credential-store';

const associatedDataFor = (accountId: AccountId): string => `relay:credentials:${accountId}`;

const serialize = (credentials: AccountCredentials): string =>
  JSON.stringify(AccountCredentialsSchema.parse(credentials));

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class AesGcmCredentialVault implements ConditionalCredentialVault {
  constructor(
    private readonly store: PgAccountCredentialStore,
    private readonly cipher: AesGcmCipher,
  ) {}

  async get(accountId: AccountId): Promise<AccountCredentials | null> {
    const envelope = await this.store.find(accountId);
    if (envelope === null) {
      return null;
    }
    return this.open(accountId, envelope);
  }

  async set(accountId: AccountId, credentials: AccountCredentials): Promise<void> {
    await this.store.save(accountId, this.seal(accountId, credentials));
  }

  async setIfUnchanged(
    accountId: AccountId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    const envelope = await this.store.find(accountId);
    if (envelope === null || serialize(this.open(accountId, envelope)) !== serialize(expected)) {
      return false;
    }
    return this.store.replace(accountId, envelope, this.seal(accountId, next));
  }

  async delete(accountId: AccountId): Promise<void> {
    await this.store.delete(accountId);
  }

  private open(accountId: AccountId, envelope: string): AccountCredentials {
    const plaintext = this.cipher.decrypt(envelope, associatedDataFor(accountId));
    const parsed = AccountCredentialsSchema.safeParse(parseJson(plaintext));
    if (!parsed.success) {
      throw new CredentialDecryptionError('Decrypted credentials are invalid');
    }
    return parsed.data;
  }

  private seal(accountId: AccountId, credentials: AccountCredentials): string {
    return this.cipher.encrypt(serialize(credentials), associatedDataFor(accountId));
  }
}
