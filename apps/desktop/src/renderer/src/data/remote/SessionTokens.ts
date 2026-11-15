import type { TokenPair } from '@relay/shared';

export interface SessionTokens {
  accessToken(): Promise<string | null>;
  renew(rejected: string | null): Promise<string | null>;
  save(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
  hasSession(): Promise<boolean>;
}

export interface SessionHooks {
  readonly onSessionExpired?: () => void;
}

export const NO_SESSION: SessionTokens = {
  accessToken: () => Promise.resolve(null),
  renew: () => Promise.resolve(null),
  save: () => Promise.resolve(),
  clear: () => Promise.resolve(),
  hasSession: () => Promise.resolve(false),
};
