import { access, utimes } from 'node:fs/promises';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import type { AttachmentId, DraftAttachment, MailAccount } from '@relay/shared/domain';
import type { IpcResult } from '@relay/shared/ipc';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachmentFilePaths } from '../../src/main/storage/attachment-files';
import { FileAttachmentStore } from '../../src/main/storage/file-attachment-store';
import { createGreenMailAccount, type GreenMailAccount } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const DAY_MS = 24 * 60 * 60 * 1000;

const okOf = <T>(result: IpcResult<T>): T | undefined => {
  expect(result.ok ? null : result.error).toBeNull();
  return result.ok ? result.data : undefined;
};

describe('local attachment sweep', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;
  let account: MailAccount | undefined;
  let store: FileAttachmentStore;

  const directory = () => harness.runtime.infrastructure.paths.attachments;

  const exists = (id: AttachmentId) =>
    access(attachmentFilePaths(directory(), id).content).then(
      () => true,
      () => false,
    );

  const age = async (id: AttachmentId) => {
    const past = new Date(Date.now() - 2 * DAY_MS);
    const paths = attachmentFilePaths(directory(), id);
    await utimes(paths.content, past, past);
    await utimes(paths.meta, past, past);
  };

  const orphan = (text: string) =>
    store.put(LOCAL_USER_ID, {
      filename: `${text}.txt`,
      contentType: 'text/plain',
      content: new TextEncoder().encode(text),
    });

  const draftAttachment = async (): Promise<DraftAttachment | undefined> => {
    const { bridge } = harness;
    const draft = okOf(
      await bridge.invoke('local.drafts.create', {
        accountId: account?.id ?? 'missing',
        to: [{ name: 'Eva', email: 'eva@firma.sk' }],
        cc: [],
        bcc: [],
        subject: 'Ponuka',
        body: 'V prílohe.',
        inReplyToThreadId: null,
        inReplyToMessageId: null,
        attachments: [],
      }),
    );
    const added = okOf(
      await bridge.invoke('local.drafts.attachments.add', {
        draftId: draft?.id ?? 'missing',
        filename: 'ponuka.txt',
        contentType: 'text/plain',
        content: new TextEncoder().encode('ponuka'),
      }),
    );
    return added?.attachment;
  };

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    harness = startLocalRuntime(dir);
    store = new FileAttachmentStore(directory(), harness.runtime.infrastructure.ids);
    account = okOf(await harness.bridge.invoke('local.accounts.create', imapAccountBody(mailbox)));
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('removes old orphan files on the due work tick and keeps referenced and fresh ones', async () => {
    const attached = await draftAttachment();
    const old = await orphan('old');
    const fresh = await orphan('fresh');
    await age(old.id);
    if (attached !== undefined) {
      await age(attached.id);
    }

    await harness.runtime.background.ticker.tick();

    expect(await exists(old.id)).toBe(false);
    expect(await exists(fresh.id)).toBe(true);
    const content = await harness.bridge.invoke('local.attachments.content', {
      attachmentId: attached?.id ?? 'missing',
    });
    expect(content.ok && Buffer.from(content.data.contentBase64, 'base64').toString()).toBe(
      'ponuka',
    );
  });

  it('removes the files of draft attachments when their account is removed', async () => {
    const attached = await draftAttachment();
    const unrelated = await orphan('unrelated');
    expect(attached).toBeDefined();

    okOf(
      await harness.bridge.invoke('local.accounts.delete', {
        accountId: account?.id ?? 'missing',
      }),
    );

    expect(await exists(attached?.id ?? ('missing' as AttachmentId))).toBe(false);
    expect(await exists(unrelated.id)).toBe(true);
  });
});
