import type { GreenMailUser } from '@relay/config/test-infra';
import type { MailProvider, OutgoingMessage, RawMessage } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailparserMessageParser, SmtpMailSender } from '../../src';
import { buildAccount, passwordCredentials } from '../support/accounts';
import { collect } from '../support/collect';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { FixedClock } from '../support/infrastructure';
import {
  createProvider,
  createProviderHarness,
  createTokenProvider,
  type ProviderHarness,
} from '../support/provider-harness';

const BCC_HEADER = /^Bcc:/im;
const decode = (source: Uint8Array | undefined): string => new TextDecoder().decode(source);

const inboxOf = async (provider: MailProvider): Promise<RawMessage[]> => {
  let fetched: RawMessage[] = [];
  await vi.waitFor(
    async () => {
      fetched = await collect(provider.fetchSince('INBOX', null));
      expect(fetched).toHaveLength(1);
    },
    { timeout: 5_000, interval: 100 },
  );
  return fetched;
};

describe('Sent copy with Bcc against GreenMail', () => {
  const sender = new SmtpMailSender({ tokens: createTokenProvider(), allowPlaintext: true });
  const parser = new MailparserMessageParser(new FixedClock(new Date('2026-11-15T10:00:00.000Z')));
  let harness: ProviderHarness;
  let hidden: GreenMailUser;
  let hiddenProvider: MailProvider;

  beforeEach(async () => {
    harness = await createProviderHarness();
    hidden = await createGreenMailUser();
    hiddenProvider = createProvider(buildAccount(hidden), passwordCredentials(hidden));
  });

  afterEach(async () => {
    await hiddenProvider.close();
    await deleteGreenMailUser(hidden);
    await harness.dispose();
  });

  it('keeps Bcc in the Sent copy only, never in what recipients receive', async () => {
    const message: OutgoingMessage = {
      from: { name: 'Ján Novák', email: harness.user.email },
      to: [{ name: null, email: harness.user.email }],
      cc: [],
      bcc: [{ name: 'Skrytý Príjemca', email: hidden.email }],
      subject: 'Ponuka',
      text: 'Posielam ponuku.',
      html: null,
      inReplyTo: null,
      references: [],
      attachments: [],
    };

    const sent = await sender.send(harness.account, passwordCredentials(harness.user), message);

    const [visible] = await inboxOf(harness.provider);
    const [blind] = await inboxOf(hiddenProvider);
    expect(decode(visible?.source)).not.toMatch(BCC_HEADER);
    expect(decode(blind?.source)).not.toMatch(BCC_HEADER);
    expect(decode(blind?.source)).toContain(sent.messageIdHeader);

    const admin = await harness.admin();
    await admin.mailboxCreate('Sent');
    const appended = await harness.provider.append('Sent', sent.sentCopy, { seen: true });
    const stored = await harness.provider.fetchMessage('Sent', appended.uid ?? 0);
    const parsed = await parser.parse(stored?.source ?? new Uint8Array());
    expect(decode(stored?.source)).toMatch(BCC_HEADER);
    expect(parsed.messageIdHeader).toBe(sent.messageIdHeader);
    expect(parsed.bcc).toEqual([{ name: 'Skrytý Príjemca', email: hidden.email }]);
    expect(parsed.to).toEqual([{ name: null, email: harness.user.email }]);
  });
});
