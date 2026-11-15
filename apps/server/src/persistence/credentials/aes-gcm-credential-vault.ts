import type { CredentialVault } from '@relay/engine';
import {
  type AccountCredentials,
  AccountCredentialsSchema,
  type AccountId,
} from '@relay/shared/domain';
import type { AesGcmCipher } from './aes-gcm-cipher';
import { CredentialDecryptionError } from './credential-decryption-error';
import type { PgAccountCredentialStore } from './pg-account-credential-store';

const associatedDataFor = (accountId: AccountId): string => `relay:credentials:${accountId}`;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class AesGcmCredentialVault implements CredentialVault {
  constructor(
    private readonly store: PgAccountCredentialStore,
    private readonly cipher: AesGcmCipher,
  ) {}

  async get(accountId: AccountId): Promise<AccountCredentials | null> {
    const envelope = await this.store.find(accountId);
    if (envelope === null) {
      return null;
    }
    const plaintext = this.cipher.decrypt(envelope, associatedDataFor(accountId));
    const parsed = AccountCredentialsSchema.safeParse(parseJson(plaintext));
    if (!parsed.success) {
      throw new CredentialDecryptionError('Decrypted credentials are invalid');
    }
    return parsed.data;
  }

  async set(accountId: AccountId, credentials: AccountCredentials): Promise<void> {
    const plaintext = JSON.stringify(AccountCredentialsSchema.parse(credentials));
    await this.store.save(accountId, this.cipher.encrypt(plaintext, associatedDataFor(accountId)));
  }

  async delete(accountId: AccountId): Promise<void> {
    await this.store.delete(accountId);
  }
}
