import type { DraftAttachment, DraftId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { setupReply } from '../support/compose-setup';
import { present } from '../support/fixtures';
import { MemoryDraftRepository } from '../support/memory/memory-draft-repository';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const memoryDrafts = (engine: TestEngine): MemoryDraftRepository => {
  expect(engine.repositories.drafts).toBeInstanceOf(MemoryDraftRepository);
  return engine.repositories.drafts as MemoryDraftRepository;
};

const twoDrafts = async (engine: TestEngine) => {
  const { reply } = await setupReply(engine);
  const source = await engine.services.compose.createDraft(USER_ID, reply);
  const target = await engine.services.compose.createDraft(USER_ID, {
    ...reply,
    inReplyToThreadId: null,
    inReplyToMessageId: null,
  });
  const added = await engine.services.compose.addDraftAttachment(USER_ID, source.id, {
    filename: 'ponuka.pdf',
    contentType: 'application/pdf',
    content: new TextEncoder().encode('pdf'),
  });
  return { source, target, attachment: added.attachment };
};

const attachRightAfterNextWrite = (
  engine: TestEngine,
  draftId: DraftId,
  attachment: DraftAttachment,
) => {
  const drafts = memoryDrafts(engine);
  const attached: { ids: string[] } = { ids: [] };
  drafts.afterWrite = async () => {
    const draft = await engine.services.compose.updateDraft(USER_ID, draftId, {
      attachments: [attachment],
    });
    attached.ids = draft.attachments.map((item) => item.id);
  };
  return attached;
};

const targetAttachments = async (engine: TestEngine, draftId: DraftId) =>
  present(await engine.repositories.drafts.findById(USER_ID, draftId)).attachments.map(
    (item) => item.id,
  );

describe('DraftService attachment release', () => {
  it('keeps a dropped blob that another draft attached before the cleanup ran', async () => {
    const engine = createTestEngine();
    const { source, target, attachment } = await twoDrafts(engine);
    const attached = attachRightAfterNextWrite(engine, target.id, attachment);

    await engine.services.compose.updateDraft(USER_ID, source.id, { attachments: [] });

    expect(attached.ids).toEqual([attachment.id]);
    expect(await targetAttachments(engine, target.id)).toEqual([attachment.id]);
    expect(engine.attachments.entries.has(attachment.id)).toBe(true);
  });

  it('keeps the blob of a deleted draft that another draft attached before the cleanup ran', async () => {
    const engine = createTestEngine();
    const { source, target, attachment } = await twoDrafts(engine);
    const attached = attachRightAfterNextWrite(engine, target.id, attachment);

    await engine.services.compose.deleteDraft(USER_ID, source.id);

    expect(attached.ids).toEqual([attachment.id]);
    expect(await targetAttachments(engine, target.id)).toEqual([attachment.id]);
    expect(engine.attachments.entries.has(attachment.id)).toBe(true);
  });

  it('still removes a dropped blob nothing references', async () => {
    const engine = createTestEngine();
    const { source, attachment } = await twoDrafts(engine);

    await engine.services.compose.updateDraft(USER_ID, source.id, { attachments: [] });

    expect(engine.attachments.entries.has(attachment.id)).toBe(false);
  });
});
