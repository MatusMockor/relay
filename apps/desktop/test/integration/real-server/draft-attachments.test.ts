import '../support/node-abort-globals';
import { extractAttachment } from '@relay/mail-core';
import type { MailAccount } from '@relay/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../../../src/renderer/src/data/MailClient';
import {
  createGreenMailAccount,
  type GreenMailAccount,
  withImap,
} from '../../main/support/greenmail';
import { createMailbox, imapAccount } from './support/mail-fixtures';
import { type RelayServer, startRelayServer } from './support/relay-server';
import { startSyncedDesktop, type SyncedDesktop, uniqueEmail } from './support/synced-desktop';

const FILENAME = 'rozpočet ľščť 2027.xlsx';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

describe('synced draft attachments against the real server', { timeout: 60_000 }, () => {
  let server: RelayServer | null = null;
  let desktop: SyncedDesktop | null = null;
  let owner: GreenMailAccount | null = null;
  let partner: GreenMailAccount | null = null;

  beforeAll(async () => {
    server = await startRelayServer();
  });

  beforeEach(async () => {
    desktop = await startSyncedDesktop(server?.url ?? '');
    owner = await createMailbox();
    partner = await createGreenMailAccount();
    await desktop.register(uniqueEmail('attach'));
  });

  afterEach(async () => {
    await desktop?.close();
    await owner?.remove();
    await partner?.remove();
  });

  afterAll(async () => {
    await server?.close();
  });

  const connect = async (): Promise<{ client: MailClient; account: MailAccount }> => {
    expect(desktop).not.toBeNull();
    expect(owner).not.toBeNull();
    const client = (desktop as SyncedDesktop).openClient();
    const account = await client.createAccount(imapAccount(owner as GreenMailAccount));
    return { client, account };
  };

  it('streams uploads through the remote client and sends them with the encoded filename', async () => {
    const { client, account } = await connect();
    const recipient = partner as GreenMailAccount;
    const draft = await client.createDraft({
      accountId: account.id,
      to: [{ name: null, email: recipient.email }],
      cc: [],
      bcc: [],
      subject: 'Rozpočet',
      body: 'Posielam rozpočet.',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
    });
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);

    const added = await client.addDraftAttachment(draft.id, {
      filename: FILENAME,
      contentType: XLSX,
      blob: new Blob([bytes], { type: XLSX }),
    });
    const extra = await client.addDraftAttachment(draft.id, {
      filename: 'navyše.txt',
      contentType: 'text/plain',
      blob: new Blob(['navyše']),
    });
    const remaining = await client.removeDraftAttachment(draft.id, extra.attachment.id);
    await expect(client.downloadAttachment(extra.attachment.id)).rejects.toMatchObject({
      code: 'not_found',
    });

    expect(added.attachment).toMatchObject({ filename: FILENAME, contentType: XLSX, size: 6 });
    expect(remaining.attachments).toEqual([added.attachment]);
    await client.send({ source: 'draft', draftId: draft.id });

    await expect
      .poll(async () => (await latestSource(recipient, 'INBOX')).byteLength, {
        timeout: 10_000,
      })
      .toBeGreaterThan(0);
    expect(await extractAttachment(await latestSource(recipient, 'INBOX'), 0)).toEqual({
      filename: FILENAME,
      contentType: XLSX,
      content: bytes,
    });
  });
});
