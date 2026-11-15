import {
  AttachmentIdSchema,
  type Draft,
  DraftIdSchema,
  type ScheduledSend,
  ScheduledSendIdSchema,
} from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { accountId, threadId, userId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const draftId = (value: string) => DraftIdSchema.parse(value);
const sendId = (value: string) => ScheduledSendIdSchema.parse(value);

const attachment = (id: string, filename: string) => ({
  id: AttachmentIdSchema.parse(id),
  filename,
  contentType: 'application/pdf',
  size: 2048,
});

const buildDraft = (overrides: Partial<Draft> = {}): Draft => ({
  id: draftId('drf-1'),
  accountId: accountId('acc-1'),
  to: [{ name: 'Jana', email: 'jana@klient.sk' }],
  cc: [],
  bcc: [],
  subject: 'Ponuka',
  body: 'Dobrý deň, v prílohe posielam ponuku.',
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: [attachment('att-2', 'b.pdf'), attachment('att-1', 'a.pdf')],
  createdAt: '2026-11-10T10:00:00.000Z',
  updatedAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

const CLAIMED_AT = '2026-11-12T08:00:00.000Z';
const STALE_BEFORE = '2026-11-12T07:50:00.000Z';

const buildSend = (overrides: Partial<ScheduledSend> = {}): ScheduledSend => ({
  id: sendId('sch-1'),
  userId: LOCAL_USER_ID,
  accountId: accountId('acc-1'),
  draftId: draftId('drf-1'),
  scheduledAt: '2026-11-12T08:00:00.000Z',
  status: 'pending',
  error: null,
  sentAt: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

describe('SqliteDraftRepository', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('creates drafts with ordered attachments and lists them newest first', async () => {
    const { drafts } = store.repositories;
    const older = buildDraft();
    const newer = buildDraft({
      id: draftId('drf-2'),
      attachments: [],
      inReplyToThreadId: threadId('thr-9'),
      updatedAt: '2026-11-11T10:00:00.000Z',
    });
    await drafts.create(LOCAL_USER_ID, older);
    await drafts.create(LOCAL_USER_ID, newer);

    expect(await drafts.listByUser(LOCAL_USER_ID)).toEqual([newer, older]);
    expect(await drafts.findById(LOCAL_USER_ID, older.id)).toEqual(older);
    expect(await drafts.findById(userId('intruder'), older.id)).toBeNull();
    expect(await drafts.findByThread(LOCAL_USER_ID, threadId('thr-9'))).toEqual(newer);
    expect(await drafts.findByThread(LOCAL_USER_ID, threadId('thr-none'))).toBeNull();
  });

  it('patches content and replaces attachments only when given', async () => {
    const { drafts } = store.repositories;
    await drafts.create(LOCAL_USER_ID, buildDraft());

    const patched = await drafts.update(
      LOCAL_USER_ID,
      draftId('drf-1'),
      { subject: 'Ponuka v2' },
      { expected: '2026-11-10T10:00:00.000Z', next: '2026-11-10T11:00:00.000Z' },
    );
    const replaced = await drafts.update(
      LOCAL_USER_ID,
      draftId('drf-1'),
      { attachments: [attachment('att-3', 'c.pdf')] },
      { expected: '2026-11-10T11:00:00.000Z', next: '2026-11-10T12:00:00.000Z' },
    );

    expect(patched).toMatchObject({ subject: 'Ponuka v2', updatedAt: '2026-11-10T11:00:00.000Z' });
    expect(patched?.attachments.map((item) => item.id)).toEqual(['att-2', 'att-1']);
    expect(replaced?.attachments.map((item) => item.id)).toEqual(['att-3']);
    expect(
      await drafts.update(
        userId('intruder'),
        draftId('drf-1'),
        { subject: 'x' },
        { expected: '2026-11-10T12:00:00.000Z', next: '2026-11-10T13:00:00.000Z' },
      ),
    ).toBeNull();
  });

  it('deletes drafts with their attachments', async () => {
    const { drafts } = store.repositories;
    await drafts.create(LOCAL_USER_ID, buildDraft());

    expect(await drafts.delete(userId('intruder'), draftId('drf-1'))).toBe(false);
    expect(await drafts.delete(LOCAL_USER_ID, draftId('drf-1'))).toBe(true);
    expect(
      store.database.sqlite.prepare('select count(*) as count from draft_attachments').get(),
    ).toEqual({ count: 0 });
  });

  it('refuses to attach the same attachment to a second draft', async () => {
    const { drafts } = store.repositories;
    await drafts.create(LOCAL_USER_ID, buildDraft());

    await expect(
      drafts.create(LOCAL_USER_ID, buildDraft({ id: draftId('drf-2') })),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await drafts.findById(LOCAL_USER_ID, draftId('drf-2'))).toBeNull();
    expect(
      (await drafts.findById(LOCAL_USER_ID, draftId('drf-1')))?.attachments.length,
    ).toBeGreaterThan(0);
  });

  it('updates a draft only from the revision the caller read', async () => {
    const { drafts } = store.repositories;
    await drafts.create(LOCAL_USER_ID, buildDraft());
    const first = { expected: '2026-11-10T10:00:00.000Z', next: '2026-11-10T11:00:00.000Z' };

    expect(
      await drafts.update(LOCAL_USER_ID, draftId('drf-1'), { body: 'A' }, first),
    ).toMatchObject({ body: 'A' });
    expect(await drafts.update(LOCAL_USER_ID, draftId('drf-1'), { body: 'B' }, first)).toBeNull();
    expect(await drafts.findById(LOCAL_USER_ID, draftId('drf-1'))).toMatchObject({
      body: 'A',
      updatedAt: '2026-11-10T11:00:00.000Z',
    });
  });

  it('claims a draft for sending once until the claim is released or stale', async () => {
    const { drafts } = store.repositories;
    await drafts.create(LOCAL_USER_ID, buildDraft());
    const claim = { claimedAt: CLAIMED_AT, staleBefore: STALE_BEFORE };
    const later = {
      claimedAt: '2026-11-12T08:01:00.000Z',
      staleBefore: '2026-11-12T07:51:00.000Z',
    };
    const afterLease = {
      claimedAt: '2026-11-12T08:11:01.000Z',
      staleBefore: '2026-11-12T08:01:01.000Z',
    };

    expect(await drafts.claimForSend(userId('intruder'), draftId('drf-1'), claim)).toBe(false);
    expect(await drafts.claimForSend(LOCAL_USER_ID, draftId('drf-1'), claim)).toBe(true);
    expect(await drafts.claimForSend(LOCAL_USER_ID, draftId('drf-1'), later)).toBe(false);
    expect(await drafts.releaseSendClaim(LOCAL_USER_ID, draftId('drf-1'), later.claimedAt)).toBe(
      false,
    );
    expect(await drafts.releaseSendClaim(LOCAL_USER_ID, draftId('drf-1'), CLAIMED_AT)).toBe(true);
    expect(await drafts.claimForSend(LOCAL_USER_ID, draftId('drf-1'), later)).toBe(true);
    expect(await drafts.claimForSend(LOCAL_USER_ID, draftId('drf-1'), afterLease)).toBe(true);
  });

  it('deletes a draft revision only while it is unchanged', async () => {
    const { drafts } = store.repositories;
    const created = await drafts.create(LOCAL_USER_ID, buildDraft());
    await drafts.update(
      LOCAL_USER_ID,
      draftId('drf-1'),
      { body: 'Upravené' },
      { expected: created.updatedAt, next: '2026-11-10T12:00:00.000Z' },
    );

    expect(await drafts.deleteRevision(LOCAL_USER_ID, draftId('drf-1'), created.updatedAt)).toBe(
      false,
    );
    expect(
      await drafts.deleteRevision(LOCAL_USER_ID, draftId('drf-1'), '2026-11-10T12:00:00.000Z'),
    ).toBe(true);
    expect(await drafts.findById(LOCAL_USER_ID, draftId('drf-1'))).toBeNull();
  });
});

describe('SqliteScheduledSendRepository', () => {
  let store: TestStore;

  beforeEach(async () => {
    store = createTestStore();
    await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  it('lists pending and due sends in schedule order', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create(
      buildSend({ id: sendId('s-late'), scheduledAt: '2026-11-12T10:00:00+02:00' }),
    );
    await scheduledSends.create(
      buildSend({
        id: sendId('s-early'),
        draftId: draftId('drf-2'),
        scheduledAt: '2026-11-12T07:00:00.000Z',
      }),
    );
    await scheduledSends.create(
      buildSend({
        id: sendId('s-future'),
        draftId: draftId('drf-3'),
        scheduledAt: '2026-12-01T07:00:00.000Z',
      }),
    );

    expect((await scheduledSends.listPending(LOCAL_USER_ID)).map((send) => send.id)).toEqual([
      's-early',
      's-late',
      's-future',
    ]);
    expect(
      (await scheduledSends.listDue('2026-11-12T08:00:00.000Z', 10)).map((send) => send.id),
    ).toEqual(['s-early', 's-late']);
    expect(await scheduledSends.listPending(userId('intruder'))).toEqual([]);
  });

  it('claims a send only once and records the outcome', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create(buildSend());
    await scheduledSends.create(buildSend({ id: sendId('sch-2'), draftId: draftId('drf-2') }));

    expect(await scheduledSends.claim(sendId('sch-1'), CLAIMED_AT)).toBe(true);
    expect(await scheduledSends.claim(sendId('sch-1'), CLAIMED_AT)).toBe(false);
    expect(
      await scheduledSends.markSent(sendId('sch-1'), '2026-11-12T08:00:05.000Z', STALE_BEFORE),
    ).toBe(false);
    expect(
      await scheduledSends.markSent(sendId('sch-1'), '2026-11-12T08:00:05.000Z', CLAIMED_AT),
    ).toBe(true);
    await scheduledSends.claim(sendId('sch-2'), CLAIMED_AT);
    expect(await scheduledSends.markFailed(sendId('sch-2'), 'SMTP 550', CLAIMED_AT)).toBe(true);
    expect(await scheduledSends.markFailed(sendId('sch-2'), 'SMTP 551', CLAIMED_AT)).toBe(false);

    expect(await scheduledSends.findById(LOCAL_USER_ID, sendId('sch-1'))).toMatchObject({
      status: 'sent',
      sentAt: '2026-11-12T08:00:05.000Z',
    });
    expect(await scheduledSends.findById(LOCAL_USER_ID, sendId('sch-2'))).toMatchObject({
      status: 'failed',
      error: 'SMTP 550',
    });
    expect(await scheduledSends.listDue('2026-12-31T00:00:00.000Z', 10)).toEqual([]);
  });

  it('cancels only pending sends of the owner', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create(buildSend());

    expect(await scheduledSends.cancel(userId('intruder'), sendId('sch-1'), STALE_BEFORE)).toBe(
      false,
    );
    expect(await scheduledSends.cancel(LOCAL_USER_ID, sendId('sch-1'), STALE_BEFORE)).toBe(true);
    expect(await scheduledSends.cancel(LOCAL_USER_ID, sendId('sch-1'), STALE_BEFORE)).toBe(false);
    expect(await scheduledSends.claim(sendId('sch-1'), CLAIMED_AT)).toBe(false);
  });

  it('rejects a second active send for the same draft', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create(buildSend());

    await expect(scheduledSends.create(buildSend({ id: sendId('sch-2') }))).rejects.toMatchObject({
      code: 'conflict',
    });
    await scheduledSends.cancel(LOCAL_USER_ID, sendId('sch-1'), STALE_BEFORE);
    await expect(scheduledSends.create(buildSend({ id: sendId('sch-2') }))).resolves.toMatchObject({
      status: 'pending',
    });
  });

  it('returns only stale sending rows to pending and cancels them after the lease', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create(buildSend());
    await scheduledSends.create(buildSend({ id: sendId('sch-2'), draftId: draftId('drf-2') }));
    await scheduledSends.create(buildSend({ id: sendId('sch-3'), draftId: draftId('drf-3') }));
    await scheduledSends.claim(sendId('sch-1'), '2026-11-12T07:00:00.000Z');
    await scheduledSends.claim(sendId('sch-2'), '2026-11-12T07:55:00.000Z');
    await scheduledSends.claim(sendId('sch-3'), '2026-11-12T07:00:00.000Z');

    expect(await scheduledSends.cancel(LOCAL_USER_ID, sendId('sch-2'), STALE_BEFORE)).toBe(false);
    expect(await scheduledSends.cancel(LOCAL_USER_ID, sendId('sch-3'), STALE_BEFORE)).toBe(true);
    expect(await scheduledSends.releaseStaleSending(STALE_BEFORE, [])).toBe(1);

    const statuses = await Promise.all(
      ['sch-1', 'sch-2', 'sch-3'].map(
        async (id) => (await scheduledSends.findById(LOCAL_USER_ID, sendId(id)))?.status,
      ),
    );
    expect(statuses).toEqual(['pending', 'sending', 'cancelled']);
  });

  it('keeps stale sends that have an unconfirmed delivery in sending', async () => {
    const { scheduledSends } = store.repositories;
    await scheduledSends.create(buildSend());
    await scheduledSends.create(buildSend({ id: sendId('sch-2'), draftId: draftId('drf-2') }));
    await scheduledSends.claim(sendId('sch-1'), '2026-11-12T07:00:00.000Z');
    await scheduledSends.claim(sendId('sch-2'), '2026-11-12T07:00:00.000Z');

    expect(await scheduledSends.releaseStaleSending(STALE_BEFORE, [sendId('sch-1')])).toBe(1);

    expect((await scheduledSends.findById(LOCAL_USER_ID, sendId('sch-1')))?.status).toBe('sending');
    expect((await scheduledSends.findById(LOCAL_USER_ID, sendId('sch-2')))?.status).toBe('pending');
  });
});
