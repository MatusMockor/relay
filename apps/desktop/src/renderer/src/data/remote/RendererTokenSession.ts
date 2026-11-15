import { api, type TokenPair } from '@relay/shared';
import { MailClientError } from '../errors';
import { type FetchLike, HttpApi } from './HttpApi';
import { NO_SESSION, type SessionHooks, type SessionTokens } from './SessionTokens';
import type { TokenStore } from './TokenStore';

export interface RendererTokenSessionOptions extends SessionHooks {
  readonly baseUrl: string;
  readonly tokens: TokenStore;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
}

const EXPIRY_SKEW_MS = 30_000;
const EXPIRED_STATUSES = new Set([400, 401, 403]);

export class RendererTokenSession implements SessionTokens {
  private refreshing: Promise<TokenPair | null> | null = null;
  private readonly publicApi: HttpApi;
  private readonly now: () => number;

  constructor(private readonly options: RendererTokenSessionOptions) {
    this.publicApi = new HttpApi({
      baseUrl: options.baseUrl,
      session: NO_SESSION,
      fetch: options.fetch,
    });
    this.now = options.now ?? (() => Date.now());
  }

  async accessToken(): Promise<string | null> {
    const tokens = await this.options.tokens.load();
    if (tokens === null) {
      return null;
    }
    if (Date.parse(tokens.accessTokenExpiresAt) - EXPIRY_SKEW_MS > this.now()) {
      return tokens.accessToken;
    }
    return (await this.refresh())?.accessToken ?? null;
  }

  async renew(rejected: string | null): Promise<string | null> {
    const tokens = await this.options.tokens.load();
    if (tokens !== null && rejected !== null && tokens.accessToken !== rejected) {
      return tokens.accessToken;
    }
    return (await this.refresh())?.accessToken ?? null;
  }

  save(tokens: TokenPair): Promise<void> {
    return this.options.tokens.save(tokens);
  }

  clear(): Promise<void> {
    return this.options.tokens.clear();
  }

  async hasSession(): Promise<boolean> {
    return (await this.options.tokens.load()) !== null;
  }

  private refresh(): Promise<TokenPair | null> {
    this.refreshing ??= this.performRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async performRefresh(): Promise<TokenPair | null> {
    const tokens = await this.options.tokens.load();
    if (tokens === null) {
      return null;
    }
    try {
      const renewed = await this.publicApi.call(api.auth.refresh, {
        body: { refreshToken: tokens.refreshToken },
      });
      await this.options.tokens.save(renewed);
      return renewed;
    } catch (error) {
      if (error instanceof MailClientError && EXPIRED_STATUSES.has(error.status ?? 0)) {
        await this.options.tokens.clear();
        this.options.onSessionExpired?.();
      }
      return null;
    }
  }
}
