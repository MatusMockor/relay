import { describe, expect, it } from 'vitest';
import { setupReply } from '../support/compose-setup';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('ComposeService concurrency', () => {
  it('keeps a draft that was edited while it was being sent', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, reply);
    engine.sender.beforeSend = async () => {
      engine.clock.advance(1000);
      await engine.services.compose.updateDraft(USER_ID, draft.id, { body: 'Edited meanwhile' });
    };

    const response = await engine.services.compose.send(USER_ID, {
      source: 'draft',
      draftId: draft.id,
    });

    expect(response.status).toBe('sent');
    const drafts = await engine.services.compose.listDrafts(USER_ID);
    expect(drafts.map((item) => item.body)).toEqual(['Edited meanwhile']);
    expect(engine.events.ofType('draft.removed')).toEqual([]);
  });

  it('flags the thread without undoing a concurrent thread change', async () => {
    const engine = createTestEngine();
    const { reply, thread } = await setupReply(engine);

    await Promise.all([
      engine.services.compose.createDraft(USER_ID, reply),
      engine.services.actions.apply(USER_ID, thread.id, { type: 'done' }),
    ]);

    expect(await engine.repositories.threads.findById(USER_ID, thread.id)).toMatchObject({
      hasDraft: true,
      state: 'done',
    });
  });

  it('refuses to share an attachment between drafts', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const attachment = await engine.services.compose.uploadAttachment(USER_ID, {
      filename: 'offer.txt',
      contentType: 'text/plain',
      contentBase64: btoa('offer'),
    });
    const first = await engine.services.compose.createDraft(USER_ID, {
      ...reply,
      attachments: [attachment],
    });

    await expect(
      engine.services.compose.createDraft(USER_ID, { ...reply, attachments: [attachment] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    const second = await engine.services.compose.createDraft(USER_ID, reply);
    await expect(
      engine.services.compose.updateDraft(USER_ID, second.id, { attachments: [attachment] }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    await engine.services.compose.updateDraft(USER_ID, first.id, {
      body: 'Still mine',
      attachments: [attachment],
    });
    expect(await engine.attachments.get(USER_ID, attachment.id)).not.toBeNull();
  });

  it('sends a draft once when two sends of it overlap', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, reply);
    const send = () =>
      engine.services.compose.send(USER_ID, { source: 'draft', draftId: draft.id });

    const results = await Promise.allSettled([send(), send()]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'conflict' },
    });
    expect(engine.sender.sent).toHaveLength(1);
    expect(await engine.services.compose.listDrafts(USER_ID)).toEqual([]);
  });

  it('lets a draft be sent again after a failed send', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, reply);
    engine.sender.failSend = 'connection reset';

    await expect(
      engine.services.compose.send(USER_ID, { source: 'draft', draftId: draft.id }),
    ).rejects.toMatchObject({ code: 'provider_error' });
    engine.sender.failSend = null;
    const response = await engine.services.compose.send(USER_ID, {
      source: 'draft',
      draftId: draft.id,
    });

    expect(response.status).toBe('sent');
    expect(engine.sender.sent).toHaveLength(1);
  });

  it('sends a scheduled draft once when it is also sent by hand', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, reply);
    await engine.services.compose.send(USER_ID, {
      source: 'draft',
      draftId: draft.id,
      scheduledAt: '2026-11-15T11:00:00.000Z',
    });
    engine.clock.set('2026-11-15T11:00:01.000Z');

    await Promise.allSettled([
      engine.services.compose.sendDueScheduled(),
      engine.services.compose.send(USER_ID, { source: 'draft', draftId: draft.id }),
    ]);

    expect(engine.sender.sent).toHaveLength(1);
  });

  it('rejects a draft update based on a revision that changed meanwhile', async () => {
    const engine = createTestEngine();
    const { reply } = await setupReply(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, reply);

    const results = await Promise.allSettled([
      engine.services.compose.updateDraft(USER_ID, draft.id, { body: 'First' }),
      engine.services.compose.updateDraft(USER_ID, draft.id, { body: 'Second' }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(results[1]).toMatchObject({ reason: { code: 'conflict' } });
    const [stored] = await engine.services.compose.listDrafts(USER_ID);
    expect(stored?.body).toBe('First');
  });
});
