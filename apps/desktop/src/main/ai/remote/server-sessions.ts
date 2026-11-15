import type { Clock } from '@relay/engine';
import type { SecretStore } from '../../secure/secret-store';
import { type FetchLike, ServerSession } from './server-session';
import { canonicalServerUrl } from './server-session-key';

export interface ServerSessionsOptions {
  readonly secrets: SecretStore;
  readonly clock: Clock;
  readonly fetch?: FetchLike;
}

export class ServerSessions {
  private readonly sessions = new Map<string, ServerSession>();

  constructor(private readonly options: ServerSessionsOptions) {}

  get(serverUrl: string): ServerSession {
    const key = canonicalServerUrl(serverUrl);
    const existing = this.sessions.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created = new ServerSession({ ...this.options, serverUrl: key });
    this.sessions.set(key, created);
    return created;
  }
}
