import type { CreateAccountBody } from '@relay/shared/api';
import { describe, expect, it } from 'vitest';
import { deliverMail, standardServer } from '../support/fixtures';
import { MemoryAccountRepository } from '../support/memory/memory-account-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const imapBody = (email: string, password = 'secret'): CreateAccountBody => ({
  provider: 'imap',
  email,
  password,
  settings: {
    imap: { host: 'imap.example.com', port: 993, secure: true },
    smtp: { host: 'smtp.example.com', port: 465, secure: true },
    username: email,
  },
});

const withServer = (engine: TestEngine, email: string) =>
  engine.providers.register(email, standardServer());

describe('AccountService', () => {
  it('creates a verified IMAP account that can sync right away', async () => {
    const engine = createTestEngine();
    const server = withServer(engine, 'alice@example.com');
    deliverMail(server, 'INBOX', { id: 'm1' });

    const account = await engine.services.accounts.create(USER_ID, {
      ...imapBody('alice@example.com'),
      displayName: 'Práca',
    });

    expect(account).toMatchObject({
      email: 'alice@example.com',
      displayName: 'Práca',
      isPrimary: true,
      status: 'connected',
      syncIntervalSeconds: 300,
      color: '#5b8def',
    });
    expect(await engine.vault.get(account.id)).toEqual({ kind: 'password', password: 'secret' });
    expect(engine.events.ofType('account.upserted').map((event) => event.data.account.id)).toEqual([
      account.id,
    ]);
    expect(await engine.repositories.accounts.listSyncable()).toHaveLength(1);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const mailboxes = await engine.services.accounts.mailboxes(USER_ID, account.id);
    expect(mailboxes.find((mailbox) => mailbox.role === 'inbox')?.totalCount).toBe(1);
  });

  it('moves the primary flag and rejects duplicates', async () => {
    const engine = createTestEngine();
    withServer(engine, 'alice@example.com');
    withServer(engine, 'alice@work.test');
    const first = await engine.services.accounts.create(USER_ID, imapBody('alice@example.com'));
    engine.events.clear();

    const second = await engine.services.accounts.create(USER_ID, {
      ...imapBody('alice@work.test'),
      isPrimary: true,
    });

    expect(second).toMatchObject({ isPrimary: true, color: '#e5735a' });
    expect((await engine.repositories.accounts.findById(USER_ID, first.id))?.isPrimary).toBe(false);
    expect(
      engine.events
        .ofType('account.upserted')
        .map((event) => [event.data.account.id, event.data.account.isPrimary]),
    ).toEqual([
      [first.id, false],
      [second.id, true],
    ]);
    await expect(
      engine.services.accounts.create(USER_ID, imapBody('ALICE@example.com')),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('refuses accounts whose connection test fails', async () => {
    const engine = createTestEngine();
    withServer(engine, 'alice@example.com');

    await expect(
      engine.services.accounts.create(USER_ID, imapBody('alice@example.com', 'wrong')),
    ).rejects.toMatchObject({ code: 'provider_error' });
    engine.sender.failVerify = 'SMTP auth rejected';
    await expect(
      engine.services.accounts.create(USER_ID, imapBody('alice@example.com')),
    ).rejects.toMatchObject({ code: 'provider_error' });

    expect(await engine.services.accounts.list(USER_ID)).toEqual([]);
    expect(engine.vault.entries.size).toBe(0);
  });

  it('reports IMAP and SMTP results separately when testing a connection', async () => {
    const engine = createTestEngine();
    withServer(engine, 'alice@example.com');
    const { settings } = imapBody('alice@example.com') as Extract<
      CreateAccountBody,
      { provider: 'imap' }
    >;

    expect(await engine.services.accounts.testConnection({ settings, password: 'secret' })).toEqual(
      {
        imap: { ok: true, error: null },
        smtp: { ok: true, error: null },
      },
    );
    engine.sender.failVerify = 'timeout';
    const failed = await engine.services.accounts.testConnection({
      settings,
      password: 'nope',
    });
    expect(failed.imap).toEqual({ ok: false, error: 'Authentication failed' });
    expect(failed.smtp).toEqual({ ok: false, error: 'timeout' });
  });

  it('stores OAuth accounts created from exchanged tokens', async () => {
    const engine = createTestEngine();
    await expect(
      engine.services.accounts.create(USER_ID, {
        provider: 'gmail',
        oauth: { code: 'c', codeVerifier: null, redirectUri: 'http://127.0.0.1:1234/callback' },
      }),
    ).rejects.toMatchObject({ code: 'not_implemented' });

    const account = await engine.services.accounts.createOAuth(USER_ID, {
      provider: 'gmail',
      email: 'alice@gmail.test',
      displayName: 'Gmail',
      credentials: {
        kind: 'oauth',
        provider: 'gmail',
        accessToken: 'access',
        refreshToken: 'refresh',
        expiresAt: '2026-11-15T11:00:00.000Z',
        scope: null,
      },
    });

    expect(account).toMatchObject({ provider: 'gmail', displayName: 'Gmail', isPrimary: true });
    expect(account.settings.imap).toEqual({ host: 'imap.gmail.com', port: 993, secure: true });
    expect((await engine.vault.get(account.id))?.kind).toBe('oauth');
    await expect(
      engine.services.accounts.update(USER_ID, account.id, { password: 'x' }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('updates preferences and verifies a new password before storing it', async () => {
    const engine = createTestEngine();
    const server = withServer(engine, 'alice@example.com');
    const account = await engine.services.accounts.create(USER_ID, imapBody('alice@example.com'));

    const renamed = await engine.services.accounts.update(USER_ID, account.id, {
      displayName: 'Osobný',
      syncIntervalSeconds: 60,
    });
    expect(renamed).toMatchObject({ displayName: 'Osobný', syncIntervalSeconds: 60 });

    await expect(
      engine.services.accounts.update(USER_ID, account.id, { password: 'stale' }),
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(await engine.vault.get(account.id)).toEqual({ kind: 'password', password: 'secret' });

    server.password = 'rotated';
    await engine.services.accounts.update(USER_ID, account.id, { password: 'rotated' });
    expect(await engine.vault.get(account.id)).toEqual({ kind: 'password', password: 'rotated' });
  });

  it('restores the old password after a failed update unless another update replaced it', async () => {
    const engine = createTestEngine();
    const server = withServer(engine, 'alice@example.com');
    const account = await engine.services.accounts.create(USER_ID, imapBody('alice@example.com'));
    const accounts = engine.repositories.accounts;
    expect(accounts).toBeInstanceOf(MemoryAccountRepository);
    const memoryAccounts = accounts as MemoryAccountRepository;
    server.password = 'first';
    memoryAccounts.failUpdate = 'disk full';

    await expect(
      engine.services.accounts.update(USER_ID, account.id, { password: 'first' }),
    ).rejects.toThrow('disk full');
    expect(await engine.vault.get(account.id)).toEqual({ kind: 'password', password: 'secret' });

    memoryAccounts.beforeUpdate = () =>
      engine.vault.set(account.id, { kind: 'password', password: 'concurrent' });
    await expect(
      engine.services.accounts.update(USER_ID, account.id, { password: 'first' }),
    ).rejects.toThrow('disk full');
    expect(await engine.vault.get(account.id)).toEqual({
      kind: 'password',
      password: 'concurrent',
    });
  });

  it('deletes an account with its data and promotes the next primary', async () => {
    const engine = createTestEngine();
    const server = withServer(engine, 'alice@example.com');
    withServer(engine, 'alice@work.test');
    const first = await engine.services.accounts.create(USER_ID, imapBody('alice@example.com'));
    const second = await engine.services.accounts.create(USER_ID, imapBody('alice@work.test'));
    deliverMail(server, 'INBOX', { id: 'm1' });
    await engine.services.sync.syncAccount(USER_ID, first.id);

    await engine.services.accounts.remove(USER_ID, first.id);

    expect(engine.events.ofType('account.removed').map((event) => event.data.accountId)).toEqual([
      first.id,
    ]);
    expect(await engine.vault.get(first.id)).toBeNull();
    expect(engine.db.tables.threads.size).toBe(0);
    expect((await engine.repositories.accounts.findById(USER_ID, second.id))?.isPrimary).toBe(true);
    await expect(engine.services.accounts.remove(USER_ID, first.id)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
