import type { AttachmentId, Draft } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { PgAttachmentBlobCatalog } from '../../src/persistence/repositories/attachments/pg-attachment-blob-catalog';
import { PgAttachmentStore } from '../../src/persistence/repositories/attachments/pg-attachment-store';
import { attachments } from '../../src/persistence/schema';
import { at, newId, seedAccount, type SeededAccount } from './support/fixtures';
import { openLockHolder } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';

const DAY_MS = 24 * 60 * 60 * 1000;

const upload = (text: string) => ({
  filename: `${text}.txt`,
  contentType: 'text/plain',
  content: new TextEncoder().encode(text),
});

const buildDraft = (seeded: SeededAccount, attached: Draft['attachments']): Draft => ({
  id: newId('draft'),
  accountId: seeded.account.id,
  to: [{ name: 'Eva', email: 'eva@firma.sk' }],
  cc: [],
  bcc: [],
  subject: 'Ponuka',
  body: 'Dobrý deň',
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: attached,
  createdAt: at(0),
  updatedAt: at(0),
});

describe('PgAttachmentBlobCatalog', () => {
  const context = usePgTestContext();

  const setup = async () => {
    const store = new PgAttachmentStore(context.db);
    const catalog = new PgAttachmentBlobCatalog(context.db);
    const seeded = await seedAccount(context.repositories);
    const put = (text: string) => store.put(seeded.user.id, upload(text));
    const age = (id: AttachmentId, days: number) =>
      context.db
        .update(attachments)
        .set({ createdAt: new Date(Date.now() - days * DAY_MS) })
        .where(eq(attachments.id, id));
    const exists = async (id: AttachmentId) => (await store.get(seeded.user.id, id)) !== null;
    return { store, catalog, seeded, put, age, exists };
  };

  it('lists blobs created before the cutoff in id order, page by page', async () => {
    const { catalog, put, age } = await setup();
    const blobs = await Promise.all(['a', 'b', 'c'].map((text) => put(text)));
    await Promise.all(blobs.map((blob) => age(blob.id, 2)));
    const fresh = await put('fresh');
    const createdBefore = new Date(Date.now() - DAY_MS).toISOString();
    const ids = blobs.map((blob) => blob.id).sort();

    const listed = (
      await catalog.listCreatedBefore({ createdBefore, after: null, limit: 1000 })
    ).map((blob) => blob.id);
    const firstPage = await catalog.listCreatedBefore({ createdBefore, after: null, limit: 2 });
    const secondPage = await catalog.listCreatedBefore({
      createdBefore,
      after: firstPage.at(-1)?.id ?? null,
      limit: 2,
    });

    expect(listed).toEqual(ids);
    expect(listed).not.toContain(fresh.id);
    expect(firstPage.map((blob) => blob.id)).toEqual(ids.slice(0, 2));
    expect(secondPage.map((blob) => blob.id)).toEqual(ids.slice(2));
    expect(Date.parse(firstPage[0]?.createdAt ?? '')).toBeLessThan(Date.parse(createdBefore));
  });

  it('deletes only blobs no draft references', async () => {
    const { catalog, seeded, put, exists } = await setup();
    const orphan = await put('orphan');
    const attached = await put('attached');
    await context.repositories.drafts.create(seeded.user.id, buildDraft(seeded, [attached]));

    const deleted = await catalog.deleteUnreferenced([orphan.id, attached.id]);

    expect(deleted).toEqual([orphan.id]);
    expect(await exists(orphan.id)).toBe(false);
    expect(await exists(attached.id)).toBe(true);
    expect(await catalog.deleteUnreferenced([])).toEqual([]);
  });

  it('skips a blob that an uncommitted draft update is attaching', async () => {
    const { catalog, seeded, put, exists } = await setup();
    const draft = await context.repositories.drafts.create(seeded.user.id, buildDraft(seeded, []));
    const uploading = await put('uploading');
    const holder = await openLockHolder(context.url);
    await holder.query(
      'insert into draft_attachments (draft_id, attachment_id, user_id, position) values ($1, $2, $3, 0)',
      [draft.id, uploading.id, seeded.user.id],
    );

    expect(await catalog.deleteUnreferenced([uploading.id])).toEqual([]);

    await holder.commit();
    expect(await exists(uploading.id)).toBe(true);
    expect(await catalog.deleteUnreferenced([uploading.id])).toEqual([]);
  });

  it('keeps a blob while a draft update replaces its attachment rows', async () => {
    const { catalog, seeded, put, exists } = await setup();
    const attached = await put('attached');
    const draft = await context.repositories.drafts.create(
      seeded.user.id,
      buildDraft(seeded, [attached]),
    );
    const holder = await openLockHolder(context.url);
    await holder.query('delete from draft_attachments where draft_id = $1', [draft.id]);

    expect(await catalog.deleteUnreferenced([attached.id])).toEqual([]);

    await holder.query(
      'insert into draft_attachments (draft_id, attachment_id, user_id, position) values ($1, $2, $3, 0)',
      [draft.id, attached.id, seeded.user.id],
    );
    await holder.commit();
    expect(await exists(attached.id)).toBe(true);
  });

  it('deletes the blobs of drafts removed together with their account', async () => {
    const { catalog, seeded, put, exists } = await setup();
    const attached = await put('attached');
    await context.repositories.drafts.create(seeded.user.id, buildDraft(seeded, [attached]));
    await context.repositories.accounts.delete(seeded.user.id, seeded.account.id);

    expect(await exists(attached.id)).toBe(true);
    expect(await catalog.deleteUnreferenced([attached.id])).toEqual([attached.id]);
  });
});
