import { ValidationError } from '@relay/engine';
import { AttachmentIdSchema, LabelIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { buildMessage, messageId, NO_HEADERS, threadId, userId } from './support/fixtures';
import { seedAccount, type SeededAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const labelId = (value: string) => LabelIdSchema.parse(value);

describe('SqliteMessageRepository', () => {
  let store: TestStore;
  let seeded: SeededAccount;

  beforeEach(async () => {
    store = createTestStore();
    seeded = await seedAccount(store.repositories);
  });

  afterEach(() => {
    store.database.close();
  });

  const message = (id: string, uid: number, overrides: Parameters<typeof buildMessage>[0] = {}) =>
    buildMessage({ id: messageId(id), uid, mailboxId: seeded.inbox.id, ...overrides });

  it('upserts a message and reads it back with labels', async () => {
    const { messages, labels } = store.repositories;
    await labels.upsert({
      id: labelId('lbl-1'),
      accountId: seeded.account.id,
      name: 'Faktúry',
      color: null,
      kind: 'keyword',
      remoteName: 'Faktúry',
    });
    const stored = message('msg-1', 1, {
      labelIds: [labelId('lbl-1')],
      attachments: [
        {
          id: AttachmentIdSchema.parse('att-1'),
          filename: 'faktura.pdf',
          contentType: 'application/pdf',
          size: 1024,
          contentId: null,
          inline: false,
        },
      ],
    });

    await messages.upsert(stored, new Map([['x-test', ['a']]]));
    await messages.upsert({ ...stored, subject: 'Faktúra - oprava' }, NO_HEADERS);

    expect(await messages.findById(LOCAL_USER_ID, stored.id)).toEqual({
      ...stored,
      subject: 'Faktúra - oprava',
    });
    expect(await messages.findById(userId('intruder'), stored.id)).toBeNull();
    expect(await messages.findByLocation({ mailboxId: seeded.inbox.id, uid: 1 })).toMatchObject({
      id: 'msg-1',
    });
  });

  it('reads the stored headers of an owned message', async () => {
    const { messages } = store.repositories;
    const headers = new Map([
      ['list-unsubscribe', ['<https://news.example.com/u/1>']],
      ['list-unsubscribe-post', ['List-Unsubscribe=One-Click']],
    ]);
    await messages.upsert(message('msg-h', 9), headers);

    expect(await messages.findHeaders(LOCAL_USER_ID, messageId('msg-h'))).toEqual(headers);
    expect(await messages.findHeaders(userId('intruder'), messageId('msg-h'))).toBeNull();
    expect(await messages.findHeaders(LOCAL_USER_ID, messageId('missing'))).toBeNull();
  });

  it('rejects a message for an unknown label', async () => {
    await expect(
      store.repositories.messages.upsert(
        message('msg-1', 1, { labelIds: [labelId('nope')] }),
        NO_HEADERS,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await store.repositories.messages.listUids(seeded.inbox.id)).toEqual([]);
  });

  it('lists thread messages by date and finds them by Message-ID headers', async () => {
    const { messages } = store.repositories;
    await messages.upsert(
      message('msg-2', 2, { date: '2026-11-10T12:00:00+02:00', messageIdHeader: '<b@x>' }),
      NO_HEADERS,
    );
    await messages.upsert(
      message('msg-1', 1, { date: '2026-11-10T09:00:00Z', messageIdHeader: '<a@x>' }),
      NO_HEADERS,
    );
    await messages.upsert(message('msg-3', 3, { threadId: threadId('thr-2') }), NO_HEADERS);

    const inThread = await messages.listByThread(LOCAL_USER_ID, threadId('thr-1'));
    expect(inThread.map((item) => item.id)).toEqual(['msg-1', 'msg-2']);
    const found = await messages.findByMessageIdHeaders(seeded.account.id, [
      '<b@x>',
      '<a@x>',
      '<z@x>',
    ]);
    expect(found.map((item) => item.id)).toEqual(['msg-1', 'msg-2']);
    expect(await messages.findByMessageIdHeaders(seeded.account.id, [])).toEqual([]);
  });

  it('updates flags, labels and location', async () => {
    const { messages, labels } = store.repositories;
    await labels.upsert({
      id: labelId('lbl-1'),
      accountId: seeded.account.id,
      name: 'A',
      color: null,
      kind: 'keyword',
      remoteName: 'A',
    });
    await messages.upsert(message('msg-1', 1), NO_HEADERS);

    await messages.updateFlags(messageId('msg-1'), { seen: true, flagged: true, answered: false });
    await messages.updateLabels(messageId('msg-1'), [labelId('lbl-1'), labelId('lbl-1')]);
    await messages.movePlacement(messageId('msg-1'), {
      from: seeded.inbox.id,
      to: { mailboxId: seeded.sent.id, uid: 77 },
      keepSource: false,
    });

    expect(await messages.findById(LOCAL_USER_ID, messageId('msg-1'))).toMatchObject({
      flags: { seen: true, flagged: true, answered: false },
      labelIds: ['lbl-1'],
      mailboxId: seeded.sent.id,
      uid: 77,
    });
    expect(await messages.listUids(seeded.inbox.id)).toEqual([]);
    expect(await messages.listUids(seeded.sent.id)).toEqual([77]);
  });

  it('adds and removes single labels without touching the others', async () => {
    const { messages, labels } = store.repositories;
    for (const id of ['lbl-1', 'lbl-2']) {
      await labels.upsert({
        id: labelId(id),
        accountId: seeded.account.id,
        name: id,
        color: null,
        kind: 'keyword',
        remoteName: id,
      });
    }
    await messages.upsert(message('msg-1', 1), NO_HEADERS);

    await Promise.all([
      messages.addLabel(messageId('msg-1'), labelId('lbl-1')),
      messages.addLabel(messageId('msg-1'), labelId('lbl-2')),
      messages.addLabel(messageId('msg-1'), labelId('lbl-2')),
    ]);
    expect((await messages.findById(LOCAL_USER_ID, messageId('msg-1')))?.labelIds).toEqual([
      'lbl-1',
      'lbl-2',
    ]);
    await messages.removeLabel(messageId('msg-1'), labelId('lbl-1'));
    expect((await messages.findById(LOCAL_USER_ID, messageId('msg-1')))?.labelIds).toEqual([
      'lbl-2',
    ]);
  });

  it('deletes messages by uid and reports the affected threads', async () => {
    const { messages } = store.repositories;
    await messages.upsert(message('msg-1', 1), NO_HEADERS);
    await messages.upsert(message('msg-2', 2), NO_HEADERS);
    await messages.upsert(message('msg-3', 3, { threadId: threadId('thr-2') }), NO_HEADERS);
    await messages.upsert(message('msg-4', 4), NO_HEADERS);

    expect(await messages.deleteByUids(seeded.inbox.id, [1, 2, 3, 99])).toEqual(['thr-1', 'thr-2']);
    expect(await messages.listUids(seeded.inbox.id)).toEqual([4]);
    expect(await messages.deleteByUids(seeded.inbox.id, [])).toEqual([]);
  });

  it('pages stored split match subjects with their headers', async () => {
    const { messages } = store.repositories;
    await messages.upsert(message('msg-1', 1), new Map([['x-jira-fingerprint', ['abc']]]));
    await messages.upsert(
      message('msg-2', 2, {
        from: null,
        cc: [{ name: 'Účtovníčka', email: 'uctovnictvo@firma.sk' }],
        attachments: [
          {
            id: AttachmentIdSchema.parse('att-1'),
            filename: 'faktura.pdf',
            contentType: 'application/pdf',
            size: 1200,
            contentId: null,
            inline: false,
          },
        ],
      }),
      NO_HEADERS,
    );
    await messages.upsert(message('msg-3', 3), NO_HEADERS);

    const first = await messages.listMatchSubjects(seeded.account.id, { cursor: null, limit: 2 });
    expect(first.items[0]?.subject).toMatchObject({
      to: [{ name: null, email: 'jan@firma.sk' }],
      cc: [],
      hasAttachments: false,
    });
    expect(first.items[1]?.subject).toMatchObject({
      cc: [{ name: 'Účtovníčka', email: 'uctovnictvo@firma.sk' }],
      hasAttachments: true,
    });
    expect(first.items.map((item) => item.messageId)).toEqual(['msg-1', 'msg-2']);
    expect(first.items[0]?.subject.headers.get('x-jira-fingerprint')).toEqual(['abc']);
    expect(first.items[0]?.subject.from).toEqual({
      name: 'Jana Nováková',
      email: 'jana@klient.sk',
    });
    expect(first.items[1]?.subject.from).toBeNull();

    const second = await messages.listMatchSubjects(seeded.account.id, {
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.items.map((item) => item.messageId)).toEqual(['msg-3']);
    expect(second.nextCursor).toBeNull();
    await expect(
      messages.listMatchSubjects(seeded.account.id, { cursor: 'garbage', limit: 2 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
