import type { DraftContent } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  attachmentReferenceLockFor,
  AttachmentSweeper,
  attachmentSweepOptions,
  DEFAULT_ATTACHMENT_SWEEP_OPTIONS,
  MIN_ATTACHMENT_SWEEP_GRACE_MS,
} from '../../src';
import { seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const GRACE_MS = DEFAULT_ATTACHMENT_SWEEP_OPTIONS.graceMs;
const HOUR_MS = 60 * 60 * 1000;

const blob = (engine: TestEngine, name: string) =>
  engine.attachments.put(USER_ID, {
    filename: name,
    contentType: 'text/plain',
    content: new TextEncoder().encode(name),
  });

const contentFor = (accountId: DraftContent['accountId']): DraftContent => ({
  accountId,
  to: [{ name: 'Peter', email: 'peter@partner.test' }],
  cc: [],
  bcc: [],
  subject: 'Ponuka',
  body: 'V prílohe',
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: [],
});

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const stored = (engine: TestEngine) => [...engine.attachments.entries.keys()].sort();

describe('AttachmentSweeper', () => {
  it('removes old unreferenced blobs and keeps referenced and fresh ones', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    const orphan = await blob(engine, 'orphan.txt');
    const attached = await blob(engine, 'attached.txt');
    await engine.services.compose.createDraft(USER_ID, {
      ...contentFor(account.id),
      attachments: [attached],
    });
    engine.clock.advance(GRACE_MS + 1);
    const fresh = await blob(engine, 'fresh.txt');

    expect(await engine.services.attachmentSweeper.sweep()).toBe(1);

    expect(stored(engine)).toEqual([attached.id, fresh.id].sort());
    expect(stored(engine)).not.toContain(orphan.id);
  });

  it('keeps an in-flight upload until the grace period has passed', async () => {
    const engine = createTestEngine();
    const uploading = await blob(engine, 'uploading.txt');
    engine.clock.advance(GRACE_MS - 1);

    expect(await engine.services.attachmentSweeper.sweep()).toBe(0);
    expect(stored(engine)).toEqual([uploading.id]);

    engine.clock.advance(2);
    expect(await engine.services.attachmentSweeper.sweep()).toBe(1);
    expect(stored(engine)).toEqual([]);
  });

  it('collects the blob of an attachment whose cleanup failed when it was removed', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    const draft = await engine.services.compose.createDraft(USER_ID, contentFor(account.id));
    const added = await engine.services.compose.addDraftAttachment(USER_ID, draft.id, {
      filename: 'ponuka.pdf',
      contentType: 'application/pdf',
      content: new TextEncoder().encode('pdf'),
    });
    engine.attachments.failDeletes = 'disk is read-only';
    await engine.services.compose.removeDraftAttachment(USER_ID, draft.id, added.attachment.id);
    engine.attachments.failDeletes = null;
    expect(stored(engine)).toEqual([added.attachment.id]);

    engine.clock.advance(GRACE_MS + 1);

    expect(await engine.services.attachmentSweeper.sweep()).toBe(1);
    expect(stored(engine)).toEqual([]);
  });

  it('waits for a draft write in flight and keeps the blob it attaches', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    const late = await blob(engine, 'late.txt');
    engine.clock.advance(GRACE_MS + 1);
    const opened = deferred();
    const writing = attachmentReferenceLockFor(engine.attachmentBlobs).shared(async () => {
      await opened.promise;
      await engine.repositories.drafts.create(USER_ID, {
        ...contentFor(account.id),
        id: engine.ids.generate('draft'),
        attachments: [late],
        createdAt: engine.clock.now().toISOString(),
        updatedAt: engine.clock.now().toISOString(),
      });
    });

    const sweeping = engine.services.attachmentSweeper.sweep();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stored(engine)).toEqual([late.id]);
    opened.resolve();
    await writing;

    expect(await sweeping).toBe(0);
    expect(stored(engine)).toEqual([late.id]);
  });

  it('pages through every old blob', async () => {
    const engine = createTestEngine();
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => blob(engine, name)));
    engine.clock.advance(GRACE_MS + 1);
    const sweeper = new AttachmentSweeper({
      blobs: engine.attachmentBlobs,
      lock: attachmentReferenceLockFor(engine.attachmentBlobs),
      clock: engine.clock,
      logger: engine.logger,
      options: attachmentSweepOptions({ batchSize: 2 }),
    });

    expect(await sweeper.sweep()).toBe(5);
    expect(stored(engine)).toEqual([]);
  });

  it('releases many blobs in batches', async () => {
    const engine = createTestEngine();
    const blobs = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => blob(engine, name)));
    const sweeper = new AttachmentSweeper({
      blobs: engine.attachmentBlobs,
      lock: attachmentReferenceLockFor(engine.attachmentBlobs),
      clock: engine.clock,
      logger: engine.logger,
      options: attachmentSweepOptions({ batchSize: 2 }),
    });

    expect(await sweeper.release([...blobs, ...blobs].map((item) => item.id))).toBe(5);
    expect(await sweeper.release([])).toBe(0);
    expect(stored(engine)).toEqual([]);
  });

  it('runs one sweep at a time and only once per interval', async () => {
    const engine = createTestEngine();
    await blob(engine, 'orphan.txt');
    engine.clock.advance(HOUR_MS / 2);
    await blob(engine, 'later.txt');
    engine.clock.advance(GRACE_MS - HOUR_MS / 2 + 1);
    const sweeper = engine.services.attachmentSweeper;

    const [first, second] = await Promise.all([sweeper.sweep(), sweeper.sweep()]);
    expect([first, second]).toEqual([1, 1]);
    expect(engine.attachments.entries.size).toBe(1);

    engine.clock.advance(HOUR_MS / 2);
    expect(await sweeper.sweepDue()).toBe(0);
    expect(engine.attachments.entries.size).toBe(1);

    engine.clock.advance(HOUR_MS / 2);
    expect(await sweeper.sweepDue()).toBe(1);
    expect(engine.attachments.entries.size).toBe(0);
  });

  it('never uses a grace period shorter than the minimum', () => {
    expect(attachmentSweepOptions({ graceMs: 0 }).graceMs).toBe(MIN_ATTACHMENT_SWEEP_GRACE_MS);
  });
});

describe('account removal', () => {
  it('removes the blobs of the account drafts right away and keeps the other drafts', async () => {
    const engine = createTestEngine();
    const { account: removed } = await seedAccount(engine);
    const { account: kept } = await seedAccount(engine, {
      email: 'work@example.com',
      isPrimary: false,
    });
    const removedBlob = await blob(engine, 'removed.txt');
    const keptBlob = await blob(engine, 'kept.txt');
    await engine.services.compose.createDraft(USER_ID, {
      ...contentFor(removed.id),
      attachments: [removedBlob],
    });
    await engine.services.compose.createDraft(USER_ID, {
      ...contentFor(kept.id),
      attachments: [keptBlob],
    });

    await engine.services.accounts.remove(USER_ID, removed.id);

    expect(stored(engine)).toEqual([keptBlob.id]);
  });

  it('removes the account even when its blobs cannot be deleted', async () => {
    const engine = createTestEngine();
    const { account } = await seedAccount(engine);
    const attached = await blob(engine, 'attached.txt');
    await engine.services.compose.createDraft(USER_ID, {
      ...contentFor(account.id),
      attachments: [attached],
    });
    engine.attachmentBlobs.beforeDelete = () => Promise.reject(new Error('disk is read-only'));

    await engine.services.accounts.remove(USER_ID, account.id);

    expect(await engine.services.accounts.list(USER_ID)).toEqual([]);
    expect(
      engine.logger.entries.some(
        (entry) => entry.message === 'Removing attachments of a removed account failed',
      ),
    ).toBe(true);
    engine.attachmentBlobs.beforeDelete = null;
    engine.clock.advance(GRACE_MS + 1);
    expect(await engine.services.attachmentSweeper.sweep()).toBe(1);
  });
});
