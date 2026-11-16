import { AttachmentIdSchema, type Draft, DraftIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteAttachmentReferences, LOCAL_USER_ID } from '../src';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const attachmentId = (value: string) => AttachmentIdSchema.parse(value);

const buildDraft = (seeded: SeededAccount, id: string, attached: string[]): Draft => ({
  id: DraftIdSchema.parse(id),
  accountId: seeded.account.id,
  to: [{ name: 'Jana', email: 'jana@klient.sk' }],
  cc: [],
  bcc: [],
  subject: 'Ponuka',
  body: 'V prílohe posielam ponuku.',
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: attached.map((value) => ({
    id: attachmentId(value),
    filename: `${value}.pdf`,
    contentType: 'application/pdf',
    size: 10,
  })),
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
});

describe('SqliteAttachmentReferenceRepository', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('reports which attachments a draft still references', async () => {
    const references = createSqliteAttachmentReferences(store.database);
    await store.repositories.drafts.create(
      LOCAL_USER_ID,
      buildDraft(seeded, 'drf-1', ['att-1', 'att-2']),
    );
    await store.repositories.drafts.create(LOCAL_USER_ID, buildDraft(seeded, 'drf-2', ['att-3']));

    const found = await references.findReferenced(
      ['att-1', 'att-3', 'att-orphan', 'att-1'].map(attachmentId),
    );

    expect([...found].sort()).toEqual(['att-1', 'att-3']);
    expect(await references.findReferenced([])).toEqual([]);
  });

  it('forgets references of deleted drafts and of drafts removed with their account', async () => {
    const references = createSqliteAttachmentReferences(store.database);
    await store.repositories.drafts.create(LOCAL_USER_ID, buildDraft(seeded, 'drf-1', ['att-1']));
    await store.repositories.drafts.create(LOCAL_USER_ID, buildDraft(seeded, 'drf-2', ['att-2']));

    await store.repositories.drafts.delete(LOCAL_USER_ID, DraftIdSchema.parse('drf-1'));
    expect(await references.findReferenced([attachmentId('att-1')])).toEqual([]);

    await store.repositories.accounts.delete(LOCAL_USER_ID, seeded.account.id);
    expect(await references.findReferenced([attachmentId('att-2')])).toEqual([]);
  });
});
