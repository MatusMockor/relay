import type { GoogleCalendarCredentials } from '@relay/engine';
import type { KeyedCredentialStore } from '@relay/mail-core';
import {
  type AccountCredentials,
  AccountCredentialsSchema,
  type CalendarConnectionId,
  type OAuthCredentials,
} from '@relay/shared/domain';
import type { AesGcmCipher } from './aes-gcm-cipher';
import { CredentialDecryptionError } from './credential-decryption-error';
import type { PgGoogleCalendarCredentialStore } from './pg-google-calendar-credential-store';

const associatedDataFor = (connectionId: CalendarConnectionId): string =>
  `relay:google-calendar:${connectionId}`;

const serialize = (credentials: AccountCredentials): string =>
  JSON.stringify(AccountCredentialsSchema.parse(credentials));

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class AesGcmGoogleCalendarCredentials
  implements GoogleCalendarCredentials, KeyedCredentialStore<CalendarConnectionId>
{
  constructor(
    private readonly store: PgGoogleCalendarCredentialStore,
    private readonly cipher: AesGcmCipher,
  ) {}

  async get(connectionId: CalendarConnectionId): Promise<AccountCredentials | null> {
    const envelope = await this.store.find(connectionId);
    return envelope === null ? null : this.open(connectionId, envelope);
  }

  async set(connectionId: CalendarConnectionId, credentials: OAuthCredentials): Promise<void> {
    if (!(await this.store.save(connectionId, this.seal(connectionId, credentials)))) {
      throw new Error(`Google calendar connection ${connectionId} does not exist`);
    }
  }

  async setIfUnchanged(
    connectionId: CalendarConnectionId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    const envelope = await this.store.find(connectionId);
    if (envelope === null || serialize(this.open(connectionId, envelope)) !== serialize(expected)) {
      return false;
    }
    return this.store.replace(connectionId, envelope, this.seal(connectionId, next));
  }

  async delete(connectionId: CalendarConnectionId): Promise<void> {
    await this.store.save(connectionId, null);
  }

  private open(connectionId: CalendarConnectionId, envelope: string): AccountCredentials {
    const plaintext = this.cipher.decrypt(envelope, associatedDataFor(connectionId));
    const parsed = AccountCredentialsSchema.safeParse(parseJson(plaintext));
    if (!parsed.success) {
      throw new CredentialDecryptionError('Decrypted Google calendar credentials are invalid');
    }
    return parsed.data;
  }

  private seal(connectionId: CalendarConnectionId, credentials: AccountCredentials): string {
    return this.cipher.encrypt(serialize(credentials), associatedDataFor(connectionId));
  }
}
