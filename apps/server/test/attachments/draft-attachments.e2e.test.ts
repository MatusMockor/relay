import { randomUUID } from 'node:crypto';
import type { GreenMailUser } from '@relay/config/test-infra';
import { composeMime, extractAttachment } from '@relay/mail-core';
import { api, buildUrl, type DraftAttachmentAdded } from '@relay/shared/api';
import type { MailAccount } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { createGreenMailUser, deleteGreenMailUser, openImap } from '../support/greenmail';
import { addImapAccount, waitForInbox } from '../support/mail-flow';
import { startTestApp, type TestApp } from '../support/test-app';
import { latestSource, waitForSource } from './support/imap-source';

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0xfe]);
const FILENAME = 'cenová ponuka č. 7.pdf';

describe('draft attachments API', () => {
  let app: TestApp;
  let owner: GreenMailUser;
  let partner: GreenMailUser;
  let ownerImap: ImapFlow;
  let token: string;
  let account: MailAccount;

  const upload = (draftId: string, body: Uint8Array, query = {}, auth = token) =>
    fetch(
      buildUrl(app.baseUrl, api.draftAttachments.add, {
        params: { id: draftId },
        query: { filename: FILENAME, contentType: 'application/pdf', ...query },
      }),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/octet-stream' },
        body,
      },
    );

  const newDraft = () =>
    app.api.ok(
      api.compose.createDraft,
      {
        body: {
          accountId: account.id,
          to: [{ name: 'Partner', email: partner.email }],
          cc: [],
          bcc: [],
          subject: 'Ponuka',
          body: 'V prílohe posielam ponuku.',
          inReplyToThreadId: null,
          inReplyToMessageId: null,
          attachments: [],
        },
      },
      token,
    );

  const contentStatus = async (attachmentId: string) =>
    (
      await fetch(
        buildUrl(app.baseUrl, api.attachments.content, { params: { id: attachmentId } }),
        {
          headers: { authorization: `Bearer ${token}` },
        },
      )
    ).status;

  beforeAll(async () => {
    owner = await createGreenMailUser('dra');
    partner = await createGreenMailUser('drp');
    ownerImap = await openImap(owner);
    await ownerImap.mailboxCreate('Sent');
    const { raw } = await composeMime({
      from: { name: 'Jana', email: partner.email },
      to: [{ name: null, email: owner.email }],
      cc: [],
      bcc: [],
      subject: 'Zmluva na podpis',
      text: 'Posielam zmluvu.',
      html: null,
      inReplyTo: null,
      references: [],
      attachments: [{ filename: 'zmluva ľščť.pdf', contentType: 'application/pdf', content: pdf }],
    });
    await ownerImap.append('INBOX', raw);
    app = await startTestApp({ env: { JOBS_ENABLED: 'true' } });
    token = (await registerUser(app.api, `dra-${randomUUID().slice(0, 8)}@relay.test`)).accessToken;
    account = await addImapAccount(app.api, token, owner);
  });

  afterAll(async () => {
    await app.close();
    await ownerImap.logout();
    await Promise.all([owner, partner].map((user) => deleteGreenMailUser(user)));
  });

  it('streams an upload into the draft and rejects foreign, oversized and malformed uploads', async () => {
    const draft = await newDraft();

    const response = await upload(draft.id, pdf);

    expect(response.status).toBe(200);
    const added = (await response.json()) as DraftAttachmentAdded;
    expect(added.attachment).toMatchObject({
      filename: FILENAME,
      contentType: 'application/pdf',
      size: pdf.byteLength,
    });
    expect(added.draft.attachments).toEqual([added.attachment]);
    const stranger = await registerUser(app.api, `drx-${randomUUID().slice(0, 8)}@relay.test`);
    expect((await upload(draft.id, pdf, {}, stranger.accessToken)).status).toBe(404);
    expect((await upload(draft.id, pdf, {}, 'invalid-token')).status).toBe(401);
    expect((await upload(draft.id, pdf, { contentType: 'text/html\r\nX-Evil: 1' })).status).toBe(
      400,
    );
    const oversized = await upload(draft.id, new Uint8Array(25 * 1024 * 1024 + 1));
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toMatchObject({
      error: { code: 'validation_failed', message: 'Súbor je väčší ako 25 MB' },
    });
    const current = await app.api.ok(api.compose.listDrafts, {}, token);
    expect(current.find((item) => item.id === draft.id)?.attachments).toHaveLength(1);
  });

  it('keeps the attachments when a draft update only changes the text', async () => {
    const draft = await newDraft();
    const added = (await (await upload(draft.id, pdf)).json()) as DraftAttachmentAdded;

    const updated = await app.api.ok(
      api.compose.updateDraft,
      { params: { id: draft.id }, body: { subject: 'Ponuka - doplnená', body: 'Upravený text.' } },
      token,
    );

    expect(updated.attachments.map((item) => item.id)).toEqual([added.attachment.id]);
    expect(await contentStatus(added.attachment.id)).toBe(200);
  });

  it('removes attachments and deletes their blobs with the draft', async () => {
    const draft = await newDraft();
    const first = (await (await upload(draft.id, pdf)).json()) as DraftAttachmentAdded;
    const second = (await (
      await upload(draft.id, pdf, { filename: 'b.pdf' })
    ).json()) as DraftAttachmentAdded;

    const updated = await app.api.ok(
      api.draftAttachments.remove,
      { params: { id: draft.id, attachmentId: first.attachment.id } },
      token,
    );

    expect(updated.attachments.map((item) => item.id)).toEqual([second.attachment.id]);
    expect(await contentStatus(first.attachment.id)).toBe(404);
    await app.api.ok(api.compose.deleteDraft, { params: { id: draft.id } }, token);
    expect(await contentStatus(second.attachment.id)).toBe(404);
  });

  it('sends the attachment with an encoded filename and keeps it in Sent', async () => {
    const draft = await newDraft();
    await upload(draft.id, pdf);
    const partnerImap = await openImap(partner);

    await app.api.ok(api.compose.send, { body: { source: 'draft', draftId: draft.id } }, token);

    const received = await waitForSource(partnerImap, 'INBOX');
    await partnerImap.logout();
    expect(new TextDecoder().decode(received)).toMatch(/filename\*0?\*?=utf-8''cenov%C3%A1/i);
    expect(await extractAttachment(received, 0)).toEqual({
      filename: FILENAME,
      contentType: 'application/pdf',
      content: pdf,
    });
    const sent = await latestSource(ownerImap, 'Sent');
    expect((await extractAttachment(sent, 0))?.filename).toBe(FILENAME);
  });

  it('forwards the attachments of a received message without the renderer uploading them', async () => {
    const [thread] = await waitForInbox(app.api, token, (threads) => threads.length === 1);
    const detail = await app.api.ok(
      api.threads.get,
      { params: { id: thread?.id ?? 'missing' } },
      token,
    );
    const message = detail.messages[0];
    const draft = await newDraft();

    const forwarded = await app.api.ok(
      api.draftAttachments.forward,
      { params: { id: draft.id }, body: { messageId: message?.id ?? 'missing' } },
      token,
    );

    expect(forwarded.attachments).toMatchObject([
      { filename: 'zmluva ľščť.pdf', contentType: 'application/pdf', size: pdf.byteLength },
    ]);
    const copy = forwarded.attachments[0]?.id ?? 'missing';
    expect(copy).not.toBe(message?.attachments[0]?.id);
    expect(await contentStatus(copy)).toBe(200);
    const missing = await app.api.fail(
      api.draftAttachments.forward,
      { params: { id: 'draft_missing' }, body: { messageId: message?.id ?? 'missing' } },
      token,
    );
    expect(missing.status).toBe(404);
  });
});
