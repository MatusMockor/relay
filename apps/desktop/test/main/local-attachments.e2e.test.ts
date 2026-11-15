import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, deliverMail, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const PDF = Buffer.from('%PDF-1.4\nfaktura 11/2026\n%%EOF\n', 'utf8');

describe('local attachment content over IPC', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('downloads a received attachment from the IMAP server', async () => {
    const { bridge } = harness;
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Faktúra za november',
      text: 'V prílohe faktúra.',
      attachments: [{ filename: 'faktúra-11.pdf', contentType: 'application/pdf', content: PDF }],
    });
    expect((await bridge.invoke('local.accounts.create', imapAccountBody(mailbox))).ok).toBe(true);
    expect((await bridge.invoke('local.sync.now', {})).ok).toBe(true);
    const page = await bridge.invoke('local.threads.list', { view: 'inbox' });
    const threadId = page.ok ? page.data.items[0]?.id : undefined;
    expect(threadId).toBeDefined();
    const detail =
      threadId === undefined ? null : await bridge.invoke('local.threads.get', { threadId });
    const meta = detail?.ok ? detail.data.messages[0]?.attachments[0] : undefined;
    expect(meta).toMatchObject({ filename: 'faktúra-11.pdf', contentType: 'application/pdf' });
    const content =
      meta === undefined
        ? null
        : await bridge.invoke('local.attachments.content', { attachmentId: meta.id });
    expect(content?.ok && content.data.filename).toBe('faktúra-11.pdf');
    expect(content?.ok && Buffer.from(content.data.contentBase64, 'base64')).toEqual(PDF);
  });

  it('serves uploaded draft attachments and reports unknown ids', async () => {
    const { bridge } = harness;
    const uploaded = await bridge.invoke('local.attachments.upload', {
      filename: 'poznamky.txt',
      contentType: 'text/plain',
      contentBase64: Buffer.from('ahoj').toString('base64'),
    });
    const id = uploaded.ok ? uploaded.data.id : undefined;
    expect(id).toBeDefined();
    const content =
      id === undefined
        ? null
        : await bridge.invoke('local.attachments.content', { attachmentId: id });
    expect(content?.ok && content.data).toEqual({
      filename: 'poznamky.txt',
      contentType: 'text/plain',
      contentBase64: Buffer.from('ahoj').toString('base64'),
    });
    const missing = await bridge.invoke('local.attachments.content', {
      attachmentId: 'att-missing',
    });
    expect(missing.ok ? null : missing.error.code).toBe('not_found');
  });
});
