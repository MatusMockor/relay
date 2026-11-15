import type { TokenPair } from '@relay/shared';

export interface TokenStore {
  load(): Promise<TokenPair | null>;
  save(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryTokenStore implements TokenStore {
  private tokens: TokenPair | null = null;

  load(): Promise<TokenPair | null> {
    return Promise.resolve(this.tokens);
  }

  save(tokens: TokenPair): Promise<void> {
    this.tokens = tokens;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.tokens = null;
    return Promise.resolve();
  }
}

export const canonicalServerUrl = (serverUrl: string): string =>
  new URL(serverUrl).href.replace(/\/+$/, '');
