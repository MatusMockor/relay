import { extractAttachment } from '@relay/mail-core';
import type { DraftContent, MailAccount } from '@relay/shared/domain';
import type { IpcResult } from '@relay/shared/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  withImap,
} from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const PDF = Buffer.from('%PDF-1.4\nponuka\n%%EOF\n', 'utf8');
const FILENAME = 'cenová ponuka č. 7.pdf';

const okOf = <T>(result: IpcResult<T>): T | undefined => {
  expect(result.ok ? null : result.error).toBeNull();
  return result.ok ? result.data : undefined;
};

const latestSource = (account: GreenMailAccount, path: string) =>
  withImap(account, async (client) => {
    const lock = await client.getMailboxLock(path);
    try {
      const exists = client.mailbox === false ? 0 : client.mailbox.exists;
      const message =
        exists === 0 ? false : await client.fetchOne(String(exists), { source: true });
      return new Uint8Array(message === false ? [] : (message.source ?? []));
    } finally {
      lock.release();
    }
  });

describe('local draft attachments over IPC', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let partner: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let account: MailAccount | undefined;

  const draftContent = (): DraftContent => ({
    accountId: account?.id ?? ('missing' as MailAccount['id']),
    to: [{ name: 'Partner', email: partner.email }],
    cc: [],
    bcc: [],
    subject: 'Ponuka',
    body: 'V prílohe posielam ponuku.',
    inReplyToThreadId: null,
    inReplyToMessageId: null,
    attachments: [],
  });

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    partner = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
    await withImap(mailbox, (client) => client.mailboxCreate('Sent'));
    account = okOf(await harness.bridge.invoke('local.accounts.create', imapAccountBody(mailbox)));
  });

  afterEach(async () => {
    await harness.close();
    await Promise.all([mailbox.remove(), partner.remove()]);
    await dir.remove();
  });

  it('adds, removes and sends attachments with an encoded filename', async () => {
    const { bridge } = harness;
    const draft = okOf(await bridge.invoke('local.drafts.create', draftContent()));
    const draftId = draft?.id ?? ('missing' as NonNullable<typeof draft>['id']);
    const added = okOf(
      await bridge.invoke('local.drafts.attachments.add', {
        draftId,
        filename: FILENAME,
        contentType: 'application/pdf',
        content: new Uint8Array(PDF),
      }),
    );
    const extra = okOf(
      await bridge.invoke('local.drafts.attachments.add', {
        draftId,
        filename: 'navyse.txt',
        contentType: 'text/plain',
        content: new TextEncoder().encode('navyše'),
      }),
    );
    expect(extra?.draft.attachments.map((item) => item.filename)).toEqual([FILENAME, 'navyse.txt']);

    const removed = okOf(
      await bridge.invoke('local.drafts.attachments.remove', {
        draftId,
        attachmentId: extra?.attachment.id ?? 'missing',
      }),
    );
    expect(removed?.attachments).toEqual([added?.attachment]);
    const gone = await bridge.invoke('local.attachments.content', {
      attachmentId: extra?.attachment.id ?? 'missing',
    });
    expect(gone.ok ? null : gone.error.code).toBe('not_found');

    okOf(await bridge.invoke('local.send', { source: 'draft', draftId }));

    const received = await latestSource(partner, 'INBOX');
    expect(new TextDecoder().decode(received)).toMatch(/filename\*0?\*?=utf-8''cenov%C3%A1/i);
    expect(await extractAttachment(received, 0)).toEqual({
      filename: FILENAME,
      contentType: 'application/pdf',
      content: new Uint8Array(PDF),
    });
    expect((await extractAttachment(await latestSource(mailbox, 'Sent'), 0))?.filename).toBe(
      FILENAME,
    );
    const cleaned = await bridge.invoke('local.attachments.content', {
      attachmentId: added?.attachment.id ?? 'missing',
    });
    expect(cleaned.ok ? null : cleaned.error.code).toBe('not_found');
  });

  it('keeps the attachments when an autosave updates only the text', async () => {
    const { bridge } = harness;
    const draft = okOf(await bridge.invoke('local.drafts.create', draftContent()));
    const draftId = draft?.id ?? ('missing' as NonNullable<typeof draft>['id']);
    const added = okOf(
      await bridge.invoke('local.drafts.attachments.add', {
        draftId,
        filename: FILENAME,
        contentType: 'application/pdf',
        content: new Uint8Array(PDF),
      }),
    );

    const updated = okOf(
      await bridge.invoke('local.drafts.update', {
        draftId,
        patch: { subject: 'Ponuka - doplnená', body: 'Upravený text.' },
      }),
    );

    expect(updated?.attachments).toEqual([added?.attachment]);
    const content = await bridge.invoke('local.attachments.content', {
      attachmentId: added?.attachment.id ?? 'missing',
    });
    expect(content.ok ? null : content.error).toBeNull();
  });

  it('forwards received attachments into a draft and cleans them up with the draft', async () => {
    const { bridge } = harness;
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Zmluva',
      text: 'Posielam zmluvu.',
      attachments: [{ filename: 'zmluva ľščť.pdf', contentType: 'application/pdf', content: PDF }],
    });
    okOf(await bridge.invoke('local.sync.now', {}));
    const page = okOf(await bridge.invoke('local.threads.list', { view: 'inbox' }));
    const threadId = page?.items[0]?.id ?? ('missing' as never);
    const detail = okOf(await bridge.invoke('local.threads.get', { threadId }));
    const message = detail?.messages[0];
    const draft = okOf(await bridge.invoke('local.drafts.create', { ...draftContent(), to: [] }));

    const forwarded = okOf(
      await bridge.invoke('local.drafts.attachments.forward', {
        draftId: draft?.id ?? 'missing',
        messageId: message?.id ?? 'missing',
      }),
    );

    const copy = forwarded?.attachments[0];
    expect(copy).toMatchObject({ filename: 'zmluva ľščť.pdf', contentType: 'application/pdf' });
    expect(copy?.id).not.toBe(message?.attachments[0]?.id);
    const content = okOf(
      await bridge.invoke('local.attachments.content', { attachmentId: copy?.id ?? 'missing' }),
    );
    expect(Buffer.from(content?.contentBase64 ?? '', 'base64')).toEqual(PDF);
    okOf(await bridge.invoke('local.drafts.delete', { draftId: draft?.id ?? 'missing' }));
    const after = await bridge.invoke('local.attachments.content', {
      attachmentId: copy?.id ?? 'missing',
    });
    expect(after.ok ? null : after.error.code).toBe('not_found');
  });

  it('rejects oversized IPC uploads before they reach the engine', async () => {
    const { bridge } = harness;
    const draft = okOf(await bridge.invoke('local.drafts.create', draftContent()));

    const result = await bridge.invoke('local.drafts.attachments.add', {
      draftId: draft?.id ?? 'missing',
      filename: 'velky.bin',
      contentType: 'application/octet-stream',
      content: new Uint8Array(25 * 1024 * 1024 + 1),
    });

    expect(result.ok ? null : result.error.code).toBe('validation_failed');
  });
});
