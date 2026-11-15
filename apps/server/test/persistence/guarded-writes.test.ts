import type { Draft, ScheduledSend, Task } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { PgAttachmentStore } from '../../src/persistence/repositories/attachments/pg-attachment-store';
import {
  at,
  buildUser,
  defaultSettings,
  newId,
  seedAccount,
  type SeededAccount,
} from './support/fixtures';
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

const buildSend = (seeded: SeededAccount, draft: Draft): ScheduledSend => ({
  id: newId('scheduledSend'),
  userId: seeded.user.id,
  accountId: seeded.account.id,
  draftId: draft.id,
  scheduledAt: at(10),
  status: 'pending',
  error: null,
  sentAt: null,
  createdAt: at(0),
});

describe('guarded Postgres writes', () => {
  const context = usePgTestContext();

  it('saves settings only while they still match the expected value', async () => {
    const user = await context.repositories.users.create(buildUser(), 'hash');
    const { settings } = context.repositories;
    const compact = { ...defaultSettings(), density: 'compact' as const };
    const urgent = { ...defaultSettings(), notifications: 'urgent' as const };

    await expect(settings.saveIfUnchanged(user.id, null, compact)).resolves.toBe(true);
    await expect(settings.saveIfUnchanged(user.id, null, urgent)).resolves.toBe(false);
    await expect(settings.saveIfUnchanged(user.id, defaultSettings(), urgent)).resolves.toBe(false);
    const results = await Promise.all([
      settings.saveIfUnchanged(user.id, compact, urgent),
      settings.saveIfUnchanged(user.id, compact, defaultSettings()),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('deletes a draft only at the revision that was sent', async () => {
    const seeded = await seedAccount(context.repositories);
    const { drafts } = context.repositories;
    const draft = await drafts.create(seeded.user.id, buildDraft(seeded));
    await drafts.update(seeded.user.id, draft.id, { body: 'Upravené' }, at(3));

    await expect(drafts.deleteRevision(seeded.user.id, draft.id, at(0))).resolves.toBe(false);
    await expect(drafts.deleteRevision(seeded.user.id, draft.id, at(3))).resolves.toBe(true);
  });

  it('refuses to share an attachment between drafts', async () => {
    const seeded = await seedAccount(context.repositories);
    const attachment = await new PgAttachmentStore(context.db).put(seeded.user.id, {
      filename: 'a.txt',
      contentType: 'text/plain',
      content: new TextEncoder().encode('a'),
    });
    await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, { attachments: [attachment] }),
    );

    await expect(
      context.repositories.drafts.create(
        seeded.user.id,
        buildDraft(seeded, { attachments: [attachment] }),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('allows one active scheduled send per draft', async () => {
    const seeded = await seedAccount(context.repositories);
    const draft = await context.repositories.drafts.create(seeded.user.id, buildDraft(seeded));
    const { scheduledSends } = context.repositories;
    const first = await scheduledSends.create(buildSend(seeded, draft));

    await expect(scheduledSends.create(buildSend(seeded, draft))).rejects.toMatchObject({
      code: 'conflict',
    });
    await scheduledSends.cancel(seeded.user.id, first.id, at(0));
    await expect(scheduledSends.create(buildSend(seeded, draft))).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('updates only the given task fields', async () => {
    const seeded = await seedAccount(context.repositories);
    const task: Task = {
      id: newId('task'),
      userId: seeded.user.id,
      threadId: null,
      jiraKey: null,
      title: 'Úloha',
      aiWhat: null,
      state: 'open',
      source: 'manual',
      createdAt: at(0),
      updatedAt: at(0),
    };
    await context.repositories.tasks.upsert(task);
    await context.repositories.tasks.update(seeded.user.id, task.id, {
      title: 'Nový názov',
      updatedAt: at(1),
    });

    await expect(
      context.repositories.tasks.update(seeded.user.id, task.id, {
        state: 'done',
        updatedAt: at(2),
      }),
    ).resolves.toEqual({ ...task, title: 'Nový názov', state: 'done', updatedAt: at(2) });
    const stranger = await seedAccount(context.repositories);
    await expect(
      context.repositories.tasks.update(stranger.user.id, task.id, { updatedAt: at(3) }),
    ).resolves.toBeNull();
  });
});
