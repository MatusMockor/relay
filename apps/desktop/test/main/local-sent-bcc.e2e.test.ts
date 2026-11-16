import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGreenMailAccount, type GreenMailAccount, withImap } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const BCC_HEADER = /^Bcc:/im;

const sourcesIn = (account: GreenMailAccount, path: string) =>
  withImap(account, async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const sources: string[] = [];
      if (client.mailbox === false || client.mailbox.exists === 0) {
        return sources;
      }
      for await (const message of client.fetch('1:*', { source: true })) {
        sources.push(message.source?.toString('utf8') ?? '');
      }
      return sources;
    } finally {
      lock.release();
    }
  });

const receivedBy = async (account: GreenMailAccount): Promise<string[]> => {
  let sources: string[] = [];
  await vi.waitFor(
    async () => {
      sources = await sourcesIn(account, 'INBOX');
      expect(sources).toHaveLength(1);
    },
    { timeout: 5_000, interval: 100 },
  );
  return sources;
};

describe('local Sent copy with Bcc', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let partner: GreenMailAccount;
  let hidden: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    partner = await createGreenMailAccount();
    hidden = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await Promise.all([mailbox.remove(), partner.remove(), hidden.remove()]);
    await dir.remove();
  });

  it('stores Bcc in the Sent copy while recipients never see it', async () => {
    const { bridge } = harness;
    const account = await bridge.invoke('local.accounts.create', imapAccountBody(mailbox));
    expect(account.ok).toBe(true);
    if (!account.ok) {
      return;
    }

    const sent = await bridge.invoke('local.send', {
      source: 'inline',
      draft: {
        accountId: account.data.id,
        to: [{ name: null, email: partner.email }],
        cc: [],
        bcc: [{ name: 'Skrytý', email: hidden.email }],
        subject: 'Ponuka',
        body: 'Posielam ponuku.',
        inReplyToThreadId: null,
        inReplyToMessageId: null,
      },
    });

    expect(sent.ok && sent.data.status).toBe('sent');
    const [toPartner] = await receivedBy(partner);
    const [toHidden] = await receivedBy(hidden);
    expect(toPartner).not.toMatch(BCC_HEADER);
    expect(toHidden).not.toMatch(BCC_HEADER);
    const [copy] = await sourcesIn(mailbox, 'Sent');
    expect(copy).toMatch(new RegExp(`^Bcc: .*${hidden.email}`, 'im'));
    const threadId = sent.ok && sent.data.status === 'sent' ? sent.data.threadId : null;
    const detail =
      threadId === null ? null : await bridge.invoke('local.threads.get', { threadId });
    expect(detail?.ok && detail.data.messages[0]?.bcc).toEqual([
      { name: 'Skrytý', email: hidden.email },
    ]);
  });
});
