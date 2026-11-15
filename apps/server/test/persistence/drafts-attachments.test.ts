import type { Draft, ScheduledSend, UserId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { PgAttachmentStore } from '../../src/persistence/repositories/attachments/pg-attachment-store';
import { PgDraftRepository } from '../../src/persistence/repositories/drafts/pg-draft-repository';
import { at, newId, seedAccount, seedThread, type SeededAccount } from './support/fixtures';
import { openInterceptedDatabase } from './support/intercepted-database';
import { usePgTestContext } from './support/pg-test-context';

const buildDraft = (seeded: SeededAccount, overrides: Partial<Draft> = {}): Draft => ({
  id: newId('draft'),
  accountId: seeded.account.id,
  to: [{ name: 'Eva', email: 'eva@firma.sk' }],
  cc: [],
  bcc: [],
  subject: 'Ponuka',
  body: 'Dobrý deň',
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: [],
  createdAt: at(0),
  updatedAt: at(0),
  ...overrides,
});

const upload = (text: string) => ({
  filename: 'zmluva.txt',
  contentType: 'text/plain',
  content: new TextEncoder().encode(text),
});

describe('PgAttachmentStore', () => {
  const context = usePgTestContext();

  it('stores content per user', async () => {
    const store = new PgAttachmentStore(context.db);
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const attachment = await store.put(seeded.user.id, upload('obsah zmluvy'));

    expect(attachment).toMatchObject({
      filename: 'zmluva.txt',
      contentType: 'text/plain',
      size: 12,
    });
    const stored = await store.get(seeded.user.id, attachment.id);
    expect(stored?.attachment).toEqual(attachment);
    expect(new TextDecoder().decode(stored?.content)).toBe('obsah zmluvy');
    await expect(store.get(stranger.user.id, attachment.id)).resolves.toBeNull();
    await expect(store.delete(stranger.user.id, attachment.id)).resolves.toBe(false);
    await expect(store.delete(seeded.user.id, attachment.id)).resolves.toBe(true);
  });
});

describe('PgDraftRepository', () => {
  const context = usePgTestContext();

  it('creates and updates drafts with ordered attachments the user owns', async () => {
    const store = new PgAttachmentStore(context.db);
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const first = await store.put(seeded.user.id, upload('a'));
    const second = await store.put(seeded.user.id, upload('bb'));
    const foreign = await store.put(stranger.user.id, upload('ccc'));

    const draft = await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, { attachments: [second, foreign, first] }),
    );
    expect(draft.attachments).toEqual([second, first]);

    const updated = await context.repositories.drafts.update(
      seeded.user.id,
      draft.id,
      { subject: 'Ponuka v2', attachments: [first] },
      { expected: draft.updatedAt, next: at(5) },
    );
    expect(updated).toEqual({
      ...draft,
      subject: 'Ponuka v2',
      attachments: [first],
      updatedAt: at(5),
    });
    const bodyOnly = await context.repositories.drafts.update(
      seeded.user.id,
      draft.id,
      { body: 'Ahoj' },
      { expected: at(5), next: at(6) },
    );
    expect(bodyOnly).toMatchObject({ body: 'Ahoj', attachments: [first], subject: 'Ponuka v2' });

    await expect(
      context.repositories.drafts.update(
        stranger.user.id,
        draft.id,
        { body: 'x' },
        { expected: at(6), next: at(7) },
      ),
    ).resolves.toBeNull();
    await expect(
      context.repositories.drafts.findById(stranger.user.id, draft.id),
    ).resolves.toBeNull();
  });

  it('reads a draft and its attachments from one snapshot', async () => {
    const store = new PgAttachmentStore(context.db);
    const seeded = await seedAccount(context.repositories);
    const first = await store.put(seeded.user.id, upload('a'));
    const second = await store.put(seeded.user.id, upload('bb'));
    const draft = await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, { body: 'v1', attachments: [first] }),
    );
    const intercepted = openInterceptedDatabase(context.url, {
      matches: (text) => text.startsWith('select') && text.includes('from "drafts"'),
      run: async () => {
        await context.repositories.drafts.update(
          seeded.user.id,
          draft.id,
          { body: 'v2', attachments: [second] },
          { expected: draft.updatedAt, next: at(9) },
        );
      },
    });

    const read = await new PgDraftRepository(intercepted.db).findById(seeded.user.id, draft.id);
    await intercepted.close();

    expect(read).toMatchObject({ body: 'v1', attachments: [first] });
    await expect(
      context.repositories.drafts.findById(seeded.user.id, draft.id),
    ).resolves.toMatchObject({ body: 'v2', attachments: [second] });
  });

  it('lists drafts, finds the latest reply draft of a thread and deletes', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread, message } = await seedThread(context.repositories, seeded);
    const older = await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, {
        inReplyToThreadId: thread.id,
        inReplyToMessageId: message.id,
        updatedAt: at(1),
      }),
    );
    const newer = await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, { inReplyToThreadId: thread.id, updatedAt: at(2) }),
    );
    const standalone = await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, { updatedAt: at(3) }),
    );

    await expect(context.repositories.drafts.listByUser(seeded.user.id)).resolves.toEqual([
      standalone,
      newer,
      older,
    ]);
    await expect(
      context.repositories.drafts.findByThread(seeded.user.id, thread.id),
    ).resolves.toEqual(newer);
    await expect(context.repositories.drafts.delete(seeded.user.id, newer.id)).resolves.toBe(true);
    await expect(
      context.repositories.drafts.findByThread(seeded.user.id, thread.id),
    ).resolves.toEqual(older);
  });
});

describe('PgScheduledSendRepository', () => {
  const context = usePgTestContext();

  const schedule = async (
    userId: UserId,
    seeded: SeededAccount,
    scheduledAt: string,
  ): Promise<ScheduledSend> => {
    const draft = await context.repositories.drafts.create(userId, buildDraft(seeded));
    return context.repositories.scheduledSends.create({
      id: newId('scheduledSend'),
      userId,
      accountId: seeded.account.id,
      draftId: draft.id,
      scheduledAt,
      status: 'pending',
      error: null,
      sentAt: null,
      createdAt: at(0),
    });
  };

  it('lists pending and due sends and claims each only once', async () => {
    const seeded = await seedAccount(context.repositories);
    const soon = await schedule(seeded.user.id, seeded, at(10));
    const later = await schedule(seeded.user.id, seeded, at(100));

    await expect(context.repositories.scheduledSends.listPending(seeded.user.id)).resolves.toEqual([
      soon,
      later,
    ]);
    await expect(context.repositories.scheduledSends.listDue(at(50), 10)).resolves.toEqual([soon]);

    const claims = await Promise.all([
      context.repositories.scheduledSends.claim(soon.id, at(50)),
      context.repositories.scheduledSends.claim(soon.id, at(50)),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await expect(context.repositories.scheduledSends.listDue(at(50), 10)).resolves.toEqual([]);

    await expect(
      context.repositories.scheduledSends.markSent(soon.id, at(11), at(49)),
    ).resolves.toBe(false);
    await expect(
      context.repositories.scheduledSends.markSent(soon.id, at(11), at(50)),
    ).resolves.toBe(true);
    await expect(
      context.repositories.scheduledSends.findById(seeded.user.id, soon.id),
    ).resolves.toEqual({
      ...soon,
      status: 'sent',
      sentAt: at(11),
    });
    await expect(
      context.repositories.scheduledSends.markFailed(later.id, 'SMTP 550', at(50)),
    ).resolves.toBe(false);
    await context.repositories.scheduledSends.claim(later.id, at(51));
    await expect(
      context.repositories.scheduledSends.markFailed(later.id, 'SMTP 550', at(51)),
    ).resolves.toBe(true);
    await expect(
      context.repositories.scheduledSends.findById(seeded.user.id, later.id),
    ).resolves.toMatchObject({
      status: 'failed',
      error: 'SMTP 550',
    });
  });

  it('cancels only pending sends of the owner', async () => {
    const seeded = await seedAccount(context.repositories);
    const stranger = await seedAccount(context.repositories);
    const send = await schedule(seeded.user.id, seeded, at(10));

    await expect(
      context.repositories.scheduledSends.findById(stranger.user.id, send.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.scheduledSends.cancel(stranger.user.id, send.id, at(0)),
    ).resolves.toBe(false);
    await expect(
      context.repositories.scheduledSends.cancel(seeded.user.id, send.id, at(0)),
    ).resolves.toBe(true);
    await expect(
      context.repositories.scheduledSends.cancel(seeded.user.id, send.id, at(0)),
    ).resolves.toBe(false);
    await expect(context.repositories.scheduledSends.listPending(seeded.user.id)).resolves.toEqual(
      [],
    );
  });
});
