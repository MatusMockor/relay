import type { GoogleCalendarCredentials } from '@relay/engine';
import type { KeyedCredentialStore } from '@relay/mail-core';
import {
  type AccountCredentials,
  AccountCredentialsSchema,
  type CalendarConnectionId,
  type OAuthCredentials,
} from '@relay/shared/domain';
import { parseJsonOrNull } from '../storage/parse-json';
import type { SecretStore } from './secret-store';

const parse = (raw: string): AccountCredentials | null => {
  const parsed = AccountCredentialsSchema.safeParse(parseJsonOrNull(raw));
  return parsed.success ? parsed.data : null;
};

const serialize = (credentials: AccountCredentials): string =>
  JSON.stringify(AccountCredentialsSchema.parse(credentials));

export class SecretStoreGoogleCalendarCredentials
  implements GoogleCalendarCredentials, KeyedCredentialStore<CalendarConnectionId>
{
  constructor(private readonly store: SecretStore) {}

  async get(connectionId: CalendarConnectionId): Promise<AccountCredentials | null> {
    const raw = await this.store.get(connectionId);
    return raw === null ? null : parse(raw);
  }

  set(connectionId: CalendarConnectionId, credentials: OAuthCredentials): Promise<void> {
    return this.store.set(connectionId, serialize(credentials));
  }

  async setIfUnchanged(
    connectionId: CalendarConnectionId,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean> {
    const raw = await this.store.get(connectionId);
    const current = raw === null ? null : parse(raw);
    if (raw === null || current === null || serialize(current) !== serialize(expected)) {
      return false;
    }
    return this.store.replace(connectionId, raw, serialize(next));
  }

  delete(connectionId: CalendarConnectionId): Promise<void> {
    return this.store.delete(connectionId);
  }
}
