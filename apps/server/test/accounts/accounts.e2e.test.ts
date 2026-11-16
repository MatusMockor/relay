import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { api } from '@relay/shared/api';
import { SERVER_DEFAULT_USER_SETTINGS } from '../../src/engine/server-user-settings';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { startGoogleTokenStub, type GoogleTokenStub } from '../support/google-token-stub';
import { createGreenMailUser, deleteGreenMailUser, greenMailSettings } from '../support/greenmail';
import { addImapAccount } from '../support/mail-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const VERIFIER = 'v'.repeat(64);
const uniqueEmail = (): string => `acc-${randomUUID().slice(0, 8)}@relay.test`;

describe('accounts and settings', () => {
  let app: TestApp;
  let google: GoogleTokenStub;
  let mailbox: GreenMailUser;

  beforeAll(async () => {
    google = await startGoogleTokenStub('someone@gmail.com');
    mailbox = await createGreenMailUser('acc');
    app = await startTestApp({
      env: {
        GOOGLE_OAUTH_CLIENT_ID: 'relay-client',
        GOOGLE_OAUTH_CLIENT_SECRET: 'relay-secret',
        GOOGLE_OAUTH_TOKEN_ENDPOINT: google.url,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await google.close();
    await deleteGreenMailUser(mailbox);
  });

  it('tests connections and manages IMAP accounts', async () => {
    const session = await registerUser(app.api, uniqueEmail());
    const token = session.accessToken;

    const good = await app.api.ok(
      api.accounts.testConnection,
      { body: { settings: greenMailSettings(mailbox), password: mailbox.password } },
      token,
    );
    expect(good).toEqual({ imap: { ok: true, error: null }, smtp: { ok: true, error: null } });
    const unreachable = {
      ...greenMailSettings(mailbox),
      imap: { host: '127.0.0.1', port: 1, secure: false },
      smtp: { host: '127.0.0.1', port: 1, secure: false },
    };
    const bad = await app.api.ok(
      api.accounts.testConnection,
      { body: { settings: unreachable, password: mailbox.password } },
      token,
    );
    expect(bad.imap.ok).toBe(false);
    expect(bad.smtp.ok).toBe(false);
    expect(bad.imap.error).toEqual(expect.any(String));

    const socket = await authenticateRealtime(app.baseUrl, token);
    const account = await addImapAccount(app.api, token, mailbox, 'Práca');
    expect(account).toMatchObject({ isPrimary: true, status: expect.any(String) as string });
    expect(JSON.stringify(account)).not.toContain(mailbox.password);
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'account.upserted',
    );

    const duplicate = await app.api.fail(
      api.accounts.create,
      {
        body: {
          provider: 'imap',
          email: mailbox.email,
          settings: greenMailSettings(mailbox),
          password: mailbox.password,
        },
      },
      token,
    );
    expect(duplicate.status).toBe(409);

    const updated = await app.api.ok(
      api.accounts.update,
      {
        params: { id: account.id },
        body: { displayName: 'Firma', senderName: '  Ján Novák ', syncIntervalSeconds: 120 },
      },
      token,
    );
    expect(updated).toMatchObject({
      displayName: 'Firma',
      senderName: 'Ján Novák',
      syncIntervalSeconds: 120,
    });
    expect(await app.api.ok(api.accounts.list, {}, token)).toEqual([updated]);

    const stranger = await registerUser(app.api, uniqueEmail());
    expect(
      (
        await app.api.fail(
          api.accounts.mailboxes,
          { params: { id: account.id } },
          stranger.accessToken,
        )
      ).status,
    ).toBe(404);

    await app.api.ok(api.accounts.remove, { params: { id: account.id } }, token);
    expect(await app.api.ok(api.accounts.list, {}, token)).toEqual([]);
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'account.removed',
    );
    socket.close();
  });

  it('creates a Gmail account from a desktop OAuth grant', async () => {
    const session = await registerUser(app.api, uniqueEmail());
    const token = session.accessToken;
    const grant = {
      code: 'good-code',
      codeVerifier: VERIFIER,
      redirectUri: 'http://127.0.0.1:53682/callback',
    };

    const account = await app.api.ok(
      api.accounts.create,
      { body: { provider: 'gmail', displayName: 'Gmail', oauth: grant } },
      token,
    );
    expect(account).toMatchObject({
      provider: 'gmail',
      email: 'someone@gmail.com',
      settings: {
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        username: 'someone@gmail.com',
      },
    });
    expect(google.requests.at(-1)?.params).toMatchObject({
      grant_type: 'authorization_code',
      code: 'good-code',
      code_verifier: VERIFIER,
      redirect_uri: grant.redirectUri,
      client_id: 'relay-client',
      client_secret: 'relay-secret',
    });

    const rejected = await app.api.fail(
      api.accounts.create,
      { body: { provider: 'gmail', oauth: { ...grant, code: 'bad-code' } } },
      token,
    );
    expect(rejected).toMatchObject({ status: 502, error: { code: 'provider_error' } });

    const noVerifier = await app.api.fail(
      api.accounts.create,
      { body: { provider: 'gmail', oauth: { ...grant, codeVerifier: null } } },
      token,
    );
    expect(noVerifier.status).toBe(400);
  });

  it('reads and patches synced user settings', async () => {
    const session = await registerUser(app.api, uniqueEmail());
    const token = session.accessToken;
    expect(await app.api.ok(api.settings.get, {}, token)).toEqual(SERVER_DEFAULT_USER_SETTINGS);

    const socket = await authenticateRealtime(app.baseUrl, token);
    const patched = await app.api.ok(
      api.settings.update,
      { body: { density: 'compact', ai: { location: 'local', features: { summaries: false } } } },
      token,
    );
    expect(patched).toEqual({
      ...SERVER_DEFAULT_USER_SETTINGS,
      density: 'compact',
      ai: {
        ...SERVER_DEFAULT_USER_SETTINGS.ai,
        location: 'local',
        features: { ...SERVER_DEFAULT_USER_SETTINGS.ai.features, summaries: false },
      },
    });
    expect(await app.api.ok(api.settings.get, {}, token)).toEqual(patched);
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'settings.updated',
    );
    socket.close();
  });
});
