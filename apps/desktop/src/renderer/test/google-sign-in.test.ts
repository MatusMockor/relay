import { describe, expect, it } from 'vitest';
import { signInWithGoogle } from '../src/features/accounts/google-sign-in';
import { HttpApi } from '../src/data/remote/HttpApi';
import { RendererTokenSession } from '../src/data/remote/RendererTokenSession';
import { createRemoteMailClient } from '../src/data/remote/RemoteMailClient';
import { MemoryTokenStore } from '../src/data/remote/TokenStore';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import type { AppServices } from '../src/session/services';
import { startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';

const GRANT = {
  code: 'auth-code-1',
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'http://127.0.0.1:5555/oauth/callback',
};

describe('Google sign-in in synced mode', () => {
  it('does not post the grant to the server when the user cancelled meanwhile', async () => {
    const server = await startContractServer();
    const store = new MemoryTokenStore();
    await store.save(tokens('access-1'));
    const client = createRemoteMailClient({
      http: new HttpApi({
        baseUrl: server.url,
        session: new RendererTokenSession({ baseUrl: server.url, tokens: store }),
      }),
    });
    const services: AppServices = { mode: 'synced', client, server: null, serverUrl: server.url };
    const platform: Platform = {
      ...createBrowserPlatform(null),
      authorizeGoogle: () => Promise.resolve({ mode: 'synced', grant: GRANT }),
    };
    await expect(signInWithGoogle(services, platform, undefined, () => true)).rejects.toMatchObject(
      { message: 'Prihlásenie cez Google bolo zrušené' },
    );
    expect(server.requests.some((request) => request.key === 'accounts.create')).toBe(false);
    client.dispose();
    await server.close();
  });
});
