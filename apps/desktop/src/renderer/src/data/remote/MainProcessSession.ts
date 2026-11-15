import type { IpcResult, RelayBridge, SessionAccess, TokenPair } from '@relay/shared';
import { MailClientError } from '../errors';
import type { SessionHooks, SessionTokens } from './SessionTokens';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

export class MainProcessSession implements SessionTokens {
  constructor(
    private readonly bridge: RelayBridge,
    private readonly serverUrl: string,
    private readonly hooks: SessionHooks = {},
  ) {}

  accessToken(): Promise<string | null> {
    return this.request(undefined);
  }

  renew(rejected: string | null): Promise<string | null> {
    return this.request(rejected);
  }

  async save(tokens: TokenPair): Promise<void> {
    await unwrap(this.bridge.invoke('session.setTokens', { serverUrl: this.serverUrl, tokens }));
  }

  async clear(): Promise<void> {
    await unwrap(this.bridge.invoke('session.clear', { serverUrl: this.serverUrl }));
  }

  async hasSession(): Promise<boolean> {
    const { signedIn } = await unwrap(
      this.bridge.invoke('session.hasTokens', { serverUrl: this.serverUrl }),
    );
    return signedIn;
  }

  private async request(rejected: string | null | undefined): Promise<string | null> {
    const access: SessionAccess = await unwrap(
      this.bridge.invoke('session.getAccessToken', {
        serverUrl: this.serverUrl,
        ...(rejected === undefined ? {} : { rejected }),
      }),
    );
    if (access.expired) {
      this.hooks.onSessionExpired?.();
    }
    return access.accessToken;
  }
}
