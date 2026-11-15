import { ProviderError, type OutgoingMessage, type RawMessage } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailparserMessageParser, SmtpMailSender } from '../../src';
import { buildAccount, passwordCredentials } from '../support/accounts';
import { collect } from '../support/collect';
import { FixedClock } from '../support/infrastructure';
import {
  createProviderHarness,
  createTokenProvider,
  type ProviderHarness,
} from '../support/provider-harness';

describe('SmtpMailSender against GreenMail', () => {
  let harness: ProviderHarness;
  const sender = new SmtpMailSender({ tokens: createTokenProvider(), allowPlaintext: true });
  const parser = new MailparserMessageParser(new FixedClock(new Date('2026-11-15T10:00:00.000Z')));

  beforeEach(async () => {
    harness = await createProviderHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  const reply = (): OutgoingMessage => ({
    from: { name: 'Matúš Testovací', email: harness.user.email },
    to: [{ name: null, email: harness.user.email }],
    cc: [],
    bcc: [{ name: 'Hidden', email: 'hidden@relay.test' }],
    subject: 'Re: Plán na štvrtok',
    text: 'Ahoj, súhlasím.',
    html: '<p>Ahoj, <b>súhlasím</b>.</p>',
    inReplyTo: '<parent@relay.test>',
    references: ['<root@relay.test>', '<parent@relay.test>'],
    attachments: [
      {
        filename: 'poznámky.txt',
        contentType: 'text/plain',
        content: new TextEncoder().encode('obsah'),
      },
    ],
  });

  it('sends a reply with threading headers and an attachment, and returns the raw MIME', async () => {
    const sent = await sender.send(harness.account, passwordCredentials(harness.user), reply());

    expect(sent.messageIdHeader).toMatch(/^<.+@.+>$/);
    expect(sent.acceptedRecipients).toEqual([harness.user.email, 'hidden@relay.test']);
    expect(sent.rejectedRecipients).toEqual([]);
    const rawText = new TextDecoder().decode(sent.raw);
    expect(rawText).toContain(`Message-ID: ${sent.messageIdHeader}`);
    expect(rawText).not.toMatch(/^Bcc:/m);

    let fetched: RawMessage[] = [];
    await vi.waitFor(
      async () => {
        fetched = await collect(harness.provider.fetchSince('INBOX', null));
        expect(fetched).toHaveLength(1);
      },
      { timeout: 5_000, interval: 100 },
    );

    const parsed = await parser.parse(fetched[0]?.source ?? new Uint8Array());
    expect(parsed.messageIdHeader).toBe(sent.messageIdHeader);
    expect(parsed.inReplyTo).toBe('<parent@relay.test>');
    expect(parsed.references).toEqual(['<root@relay.test>', '<parent@relay.test>']);
    expect(parsed.subject).toBe('Re: Plán na štvrtok');
    expect(parsed.from).toEqual({ name: 'Matúš Testovací', email: harness.user.email });
    expect(parsed.textBody?.trim()).toBe('Ahoj, súhlasím.');
    expect(parsed.attachments).toMatchObject([
      { filename: 'poznámky.txt', contentType: 'text/plain', size: 5 },
    ]);
  });

  it('can append the returned raw MIME to the Sent mailbox', async () => {
    const admin = await harness.admin();
    await admin.mailboxCreate('Sent');
    const sent = await sender.send(harness.account, passwordCredentials(harness.user), reply());

    const appended = await harness.provider.append('Sent', sent.raw, { seen: true });
    const stored = await harness.provider.fetchMessage('Sent', appended.uid ?? 0);

    expect(new TextDecoder().decode(stored?.source)).toContain(sent.messageIdHeader);
  });

  it('sends with XOAUTH2 credentials', async () => {
    const account = buildAccount(harness.user, { provider: 'gmail' });
    const credentials = {
      kind: 'oauth' as const,
      provider: 'gmail' as const,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: '2026-11-15T11:00:00.000Z',
      scope: 'https://mail.google.com/',
    };

    await expect(sender.verify(account, credentials)).resolves.toBeUndefined();
    const sent = await sender.send(account, credentials, reply());
    expect(sent.acceptedRecipients).toContain(harness.user.email);
  });

  it('verifies the connection and wraps failures in ProviderError', async () => {
    await expect(
      sender.verify(harness.account, passwordCredentials(harness.user)),
    ).resolves.toBeUndefined();

    const unreachable = buildAccount(harness.user, {
      settings: {
        ...harness.account.settings,
        smtp: { host: '127.0.0.1', port: 1, secure: false },
      },
    });
    await expect(
      sender.verify(unreachable, passwordCredentials(harness.user)),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
