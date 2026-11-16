import type { CreateAccountBody } from '@relay/shared/api';
import { describe, expect, it } from 'vitest';
import { seedAccount, standardServer } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const imapBody = (engine: TestEngine, email: string): CreateAccountBody => {
  engine.providers.register(email, standardServer());
  return {
    provider: 'imap',
    email,
    password: 'secret',
    settings: {
      imap: { host: 'imap.example.com', port: 993, secure: true },
      smtp: { host: 'smtp.example.com', port: 465, secure: true },
      username: email,
    },
  };
};

const OAUTH = {
  kind: 'oauth',
  provider: 'gmail',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: '2026-11-15T11:00:00.000Z',
  scope: null,
} as const;

describe('account sender name', () => {
  it('keeps the account label and the sender name apart', async () => {
    const engine = createTestEngine();

    const account = await engine.services.accounts.create(USER_ID, {
      ...imapBody(engine, 'alice@example.com'),
      displayName: 'Práca',
      senderName: 'Alice Novak',
    });

    expect(account).toMatchObject({ displayName: 'Práca', senderName: 'Alice Novak' });
  });

  it('defaults a new account to the sender name of the primary account', async () => {
    const engine = createTestEngine();
    await engine.services.accounts.create(USER_ID, {
      ...imapBody(engine, 'alice@example.com'),
      senderName: 'Alice Novak',
    });

    const gmail = await engine.services.accounts.createOAuth(USER_ID, {
      provider: 'gmail',
      email: 'alice@gmail.test',
      credentials: OAUTH,
    });
    const unnamed = await engine.services.accounts.create(USER_ID, {
      ...imapBody(engine, 'alice@work.test'),
      senderName: null,
    });

    expect(gmail).toMatchObject({ displayName: 'alice@gmail.test', senderName: 'Alice Novak' });
    expect(unnamed.senderName).toBeNull();
  });

  it('leaves the sender name empty for the first account without one', async () => {
    const engine = createTestEngine();

    const account = await engine.services.accounts.create(
      USER_ID,
      imapBody(engine, 'alice@example.com'),
    );

    expect(account).toMatchObject({ displayName: 'alice@example.com', senderName: null });
  });

  it('updates and clears the sender name', async () => {
    const engine = createTestEngine();
    const account = await engine.services.accounts.create(
      USER_ID,
      imapBody(engine, 'alice@example.com'),
    );

    const named = await engine.services.accounts.update(USER_ID, account.id, {
      senderName: 'Alice Novak',
    });
    const cleared = await engine.services.accounts.update(USER_ID, account.id, {
      senderName: null,
    });

    expect(named).toMatchObject({ displayName: 'alice@example.com', senderName: 'Alice Novak' });
    expect(cleared.senderName).toBeNull();
  });

  it('sends with the sender name, never the account label', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine, {
      displayName: 'Práca',
      senderName: 'Alice Novak',
    });
    const content = {
      accountId: account.id,
      to: [{ name: null, email: 'peter@partner.test' }],
      cc: [],
      bcc: [],
      subject: 'Ponuka',
      body: 'Ahoj',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
    };

    await engine.services.compose.send(USER_ID, { source: 'inline', draft: content });
    await engine.repositories.accounts.update(USER_ID, account.id, { senderName: null });
    await engine.services.compose.send(USER_ID, { source: 'inline', draft: content });

    expect(engine.sender.sent.map((sent) => sent.message.from)).toEqual([
      { name: 'Alice Novak', email: account.email },
      { name: null, email: account.email },
    ]);
  });
});
