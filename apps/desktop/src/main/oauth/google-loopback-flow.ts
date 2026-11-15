import { buildGoogleAuthUrl, createOAuthState, createPkcePair } from '@relay/mail-core';
import type { OAuthGrant } from '@relay/shared/api';
import type { UrlOpener } from '../platform/url-opener';
import type { GoogleClientConfig, GoogleClientConfigSource } from './google-client-config-source';
import { startLoopbackReceiver } from './loopback-receiver';

export const DEFAULT_OAUTH_TIMEOUT_MS = 5 * 60_000;

export interface GoogleAuthorization {
  readonly grant: OAuthGrant & { readonly codeVerifier: string };
  readonly config: GoogleClientConfig;
}

export interface GoogleAuthorizeOptions {
  readonly loginHint?: string;
  readonly signal?: AbortSignal;
}

export class GoogleLoopbackFlow {
  constructor(
    private readonly configSource: GoogleClientConfigSource,
    private readonly opener: UrlOpener,
    private readonly timeoutMs = DEFAULT_OAUTH_TIMEOUT_MS,
  ) {}

  async authorize(options: GoogleAuthorizeOptions = {}): Promise<GoogleAuthorization> {
    const config = await this.configSource.load();
    const pkce = createPkcePair();
    const state = createOAuthState();
    const receiver = await startLoopbackReceiver({
      expectedState: state,
      timeoutMs: this.timeoutMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    try {
      await this.opener.open(
        buildGoogleAuthUrl({
          clientId: config.clientId,
          redirectUri: receiver.redirectUri,
          codeChallenge: pkce.codeChallenge,
          state,
          ...(options.loginHint === undefined ? {} : { loginHint: options.loginHint }),
          ...(config.authEndpoint === undefined ? {} : { authEndpoint: config.authEndpoint }),
        }),
      );
      const code = await receiver.code;
      return {
        grant: { code, codeVerifier: pkce.codeVerifier, redirectUri: receiver.redirectUri },
        config,
      };
    } finally {
      await receiver.close();
    }
  }
}
