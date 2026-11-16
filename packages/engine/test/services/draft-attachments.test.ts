import { type AttachmentId, MAX_ATTACHMENT_BYTES, type MessageId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { setupReply } from '../support/compose-setup';
import { present } from '../support/fixtures';
import { createTestEngine, OTHER_USER_ID, type TestEngine, USER_ID } from '../support/test-engine';

const bytes = (text: string) => new TextEncoder().encode(text);

const draftOf = async (engine: TestEngine) => {
  const { reply } = await setupReply(engine);
  return engine.services.compose.createDraft(USER_ID, reply);
};

describe('DraftAttachmentService', () => {
  it('adds an uploaded file to the draft and sends it', async () => {
    const engine = createTestEngine();
    const draft = await draftOf(engine);

    const added = await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: '  cenová ponuka.pdf ',
      contentType: 'Application/PDF',
      content: bytes('pdf'),
    });

    expect(added.attachment).toMatchObject({
      filename: 'cenová ponuka.pdf',
      contentType: 'application/pdf',
      size: 3,
    });
    expect(added.draft.attachments).toEqual([added.attachment]);
    expect(engine.events.ofType('draft.upserted').at(-1)?.data.draft.attachments).toHaveLength(1);

    await engine.services.compose.send(USER_ID, { source: 'draft', draftId: draft.id });

    const sent = present(engine.sender.sent[0]).message.attachments;
    expect(sent.map((item) => [item.filename, item.contentType])).toEqual([
      ['cenová ponuka.pdf', 'application/pdf'],
    ]);
    expect(engine.attachments.entries.size).toBe(0);
  });

  it('keeps every attachment when uploads to one draft run concurrently', async () => {
    const engine = createTestEngine();
    const draft = await draftOf(engine);

    const results = await Promise.all(
      ['a.txt', 'b.txt', 'c.txt'].map((filename) =>
        engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
          filename,
          contentType: 'text/plain',
          content: bytes(filename),
        }),
      ),
    );

    const stored = present(await engine.repositories.drafts.findById(USER_ID, draft.id));
    expect(stored.attachments.map((item) => item.filename).sort()).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
    ]);
    expect(engine.attachments.entries.size).toBe(3);
    expect(results).toHaveLength(3);
  });

  it('removes an attachment from the draft and deletes its blob', async () => {
    const engine = createTestEngine();
    const draft = await draftOf(engine);
    const first = await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: 'a.txt',
      contentType: 'text/plain',
      content: bytes('a'),
    });
    const second = await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: 'b.txt',
      contentType: 'text/plain',
      content: bytes('b'),
    });

    const updated = await engine.services.compose.removeDraftAttachment(
      USER_ID,
      draft.id,
      first.attachment.id,
    );

    expect(updated.attachments.map((item) => item.filename)).toEqual(['b.txt']);
    expect([...engine.attachments.entries.keys()]).toEqual([second.attachment.id]);
    await expect(
      engine.services.compose.removeDraftAttachment(USER_ID, draft.id, first.attachment.id),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('deletes blobs dropped by a draft update and by deleting the draft', async () => {
    const engine = createTestEngine();
    const draft = await draftOf(engine);
    const kept = await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: 'kept.txt',
      contentType: 'text/plain',
      content: bytes('k'),
    });
    await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: 'dropped.txt',
      contentType: 'text/plain',
      content: bytes('d'),
    });

    await engine.services.compose.updateDraft(USER_ID, draft.id, {
      attachments: [kept.attachment],
    });
    expect([...engine.attachments.entries.keys()]).toEqual([kept.attachment.id]);
    await engine.services.compose.updateDraft(USER_ID, draft.id, { body: 'Bez zmeny príloh' });
    expect(engine.attachments.entries.size).toBe(1);

    await engine.services.compose.deleteDraft(USER_ID, draft.id);
    expect(engine.attachments.entries.size).toBe(0);
  });

  it('enforces the per file and total limits without leaving blobs behind', async () => {
    const engine = createTestEngine();
    const draft = await draftOf(engine);
    const half = new Uint8Array(MAX_ATTACHMENT_BYTES / 2 + 1);

    await expect(
      engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
        filename: 'big.bin',
        contentType: 'application/octet-stream',
        content: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
      }),
    ).rejects.toMatchObject({ code: 'validation_failed', message: 'Súbor je väčší ako 25 MB' });
    await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: 'half.bin',
      contentType: 'application/octet-stream',
      content: half,
    });
    await expect(
      engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
        filename: 'half-2.bin',
        contentType: 'application/octet-stream',
        content: half,
      }),
    ).rejects.toMatchObject({ message: 'Prílohy spolu presahujú 25 MB' });

    expect(engine.attachments.entries.size).toBe(1);
  });

  it('only lets the owner attach files to a draft', async () => {
    const engine = createTestEngine();
    const draft = await draftOf(engine);

    await expect(
      engine.services.compose.addDraftAttachment(OTHER_USER_ID, draft.id, {
        filename: 'x.txt',
        contentType: 'text/plain',
        content: bytes('x'),
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(engine.attachments.entries.size).toBe(0);
  });

  it('copies the non-inline attachments of a forwarded message into the draft', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const source = await engine.attachments.put(USER_ID, {
      filename: 'zmluva.pdf',
      contentType: 'application/pdf',
      content: bytes('zmluva'),
    });
    const messageId = present(reply.inReplyToMessageId);
    const message = present(engine.db.tables.messages.get(messageId));
    engine.db.tables.messages.set(messageId, {
      ...message,
      attachments: [
        { ...source, filename: 'zmluva.pdf', contentId: null, inline: false },
        { ...source, id: 'att_logo' as AttachmentId, contentId: 'logo', inline: true },
      ],
    });
    const draft = await engine.services.compose.createDraft(USER_ID, {
      ...reply,
      to: [],
      subject: 'Fwd: Offer',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
    });

    const forwarded = await engine.services.compose.forwardAttachments(
      USER_ID,
      draft.id,
      messageId,
    );

    const [copy] = forwarded.attachments;
    expect(forwarded.attachments.map((item) => item.filename)).toEqual(['zmluva.pdf']);
    expect(copy?.id).not.toBe(source.id);
    expect(
      new TextDecoder().decode(
        present(engine.attachments.entries.get(present(copy).id)).stored.content,
      ),
    ).toBe('zmluva');
    await expect(
      engine.services.compose.forwardAttachments(USER_ID, draft.id, 'msg_missing' as MessageId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
