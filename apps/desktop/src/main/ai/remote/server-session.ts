import type { Clock } from '@relay/engine';
import { type TokenPair, TokenPairSchema } from '@relay/shared/api';
import type { SessionAccess } from '@relay/shared/ipc';
import type { SecretStore } from '../../secure/secret-store';
import { type RefreshOutcome, TokenRefreshRequest } from './token-refresh-request';
import { sessionSecretKey } from './server-session-key';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ServerSessionOptions {
  readonly serverUrl: string;
  readonly secrets: SecretStore;
  readonly clock: Clock;
  readonly fetch?: FetchLike;
}

const REFRESH_AHEAD_MS = 60_000;
const SIGNED_OUT: SessionAccess = { accessToken: null, expired: false };
const EXPIRED: SessionAccess = { accessToken: null, expired: true };

const parseTokens = (raw: string | null): TokenPair | null => {
  if (raw === null) {
    return null;
  }
  try {
    const parsed = TokenPairSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export class ServerSession {
  private readonly key: string;
  private readonly refreshRequest: TokenRefreshRequest;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly refreshing = new Map<string | null, Promise<SessionAccess>>();
  private expired = false;

  constructor(private readonly options: ServerSessionOptions) {
    this.key = sessionSecretKey(options.serverUrl);
    this.refreshRequest = new TokenRefreshRequest(options.serverUrl, options.fetch);
  }

  async access(): Promise<SessionAccess> {
    const tokens = await this.load();
    if (tokens === null) {
      return this.signedOut();
    }
    if (this.remaining(tokens) > REFRESH_AHEAD_MS) {
      return { accessToken: tokens.accessToken, expired: false };
    }
    return this.shared(null);
  }

  renew(rejected: string | null): Promise<SessionAccess> {
    return this.shared(rejected);
  }

  async accessToken(): Promise<string | null> {
    return (await this.access()).accessToken;
  }

  async renewAfterRejection(rejected: string): Promise<string | null> {
    return (await this.renew(rejected)).accessToken;
  }

  async hasTokens(): Promise<boolean> {
    return (await this.load()) !== null;
  }

  save(tokens: TokenPair): Promise<void> {
    this.refreshing.clear();
    return this.serialized(async () => {
      this.expired = false;
      await this.options.secrets.set(this.key, JSON.stringify(tokens));
    });
  }

  clear(): Promise<void> {
    this.refreshing.clear();
    return this.serialized(async () => {
      this.expired = false;
      await this.options.secrets.delete(this.key);
    });
  }

  private signedOut(): SessionAccess {
    return this.expired ? EXPIRED : SIGNED_OUT;
  }

  private shared(rejected: string | null): Promise<SessionAccess> {
    const running = this.refreshing.get(rejected);
    if (running !== undefined) {
      return running;
    }
    const attempt = this.serialized(() => this.resolve(rejected)).finally(() => {
      if (this.refreshing.get(rejected) === attempt) {
        this.refreshing.delete(rejected);
      }
    });
    this.refreshing.set(rejected, attempt);
    return attempt;
  }

  private serialized<Result>(work: () => Promise<Result>): Promise<Result> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async resolve(rejected: string | null): Promise<SessionAccess> {
    const tokens = await this.load();
    if (tokens === null) {
      return this.signedOut();
    }
    const stale = rejected === tokens.accessToken || this.remaining(tokens) <= REFRESH_AHEAD_MS;
    if (!stale) {
      return { accessToken: tokens.accessToken, expired: false };
    }
    return this.settle(tokens, await this.refreshRequest.send(tokens.refreshToken));
  }

  private async settle(seen: TokenPair, outcome: RefreshOutcome): Promise<SessionAccess> {
    const current = await this.load();
    if (current?.refreshToken !== seen.refreshToken) {
      return current === null
        ? this.signedOut()
        : { accessToken: current.accessToken, expired: false };
    }
    if (outcome.kind === 'renewed') {
      await this.options.secrets.set(this.key, JSON.stringify(outcome.tokens));
      return { accessToken: outcome.tokens.accessToken, expired: false };
    }
    if (outcome.kind === 'rejected') {
      this.expired = true;
      await this.options.secrets.delete(this.key);
      return EXPIRED;
    }
    return this.remaining(seen) > 0
      ? { accessToken: seen.accessToken, expired: false }
      : SIGNED_OUT;
  }

  private async load(): Promise<TokenPair | null> {
    return parseTokens(await this.options.secrets.get(this.key));
  }

  private remaining(tokens: TokenPair): number {
    return Date.parse(tokens.accessTokenExpiresAt) - this.options.clock.now().getTime();
  }
}
