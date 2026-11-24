import type { MailboxId, MailboxRole, Message, MessageId } from '@relay/shared/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EffectGates, PlacementIdentity, PlaceRequest } from '../../src';
import { MemoryDatabase } from '../support/memory/memory-database';
import { MemoryMessageRepository } from '../support/memory/memory-message-repository';
import {
  ACCOUNT,
  ALL_MAIL,
  at,
  identityAt,
  INBOX,
  placedMessage,
  SENT,
  SPAM,
} from '../support/placement-fixtures';

const ALL: EffectGates = { jira: true, invite: true };
const NONE: EffectGates = { jira: false, invite: false };
const NOW = '2026-11-24T09:00:00.000Z';
const ROLES: readonly [MailboxId, MailboxRole][] = [
  [INBOX, 'inbox'],
  [ALL_MAIL, 'archive'],
  [SENT, 'sent'],
  [SPAM, 'spam'],
];

const request = (
  identity: PlacementIdentity,
  create: Message | null = null,
  claims: EffectGates = NONE,
): PlaceRequest => ({
  ...identity,
  create: create === null ? null : { message: create, headers: new Map() },
  claims,
  at: NOW,
});

describe('MemoryMessageRepository placements', () => {
  let db: MemoryDatabase;
  let messages: MemoryMessageRepository;

  beforeEach(() => {
    db = new MemoryDatabase();
    ROLES.forEach(([id, role]) => {
      db.tables.mailboxes.set(id, {
        id,
        accountId: ACCOUNT,
        name: id,
        path: id,
        delimiter: '/',
        role,
        subscribed: true,
        uidValidity: null,
        unreadCount: 0,
        totalCount: 0,
      });
    });
    messages = new MemoryMessageRepository(db);
  });

  const stored = (id: string) => db.tables.messages.get(id as MessageId);

  const gmailMessage = async () => {
    await messages.place(
      request(
        identityAt(at(INBOX, 5), 'inbox'),
        placedMessage('msg', [at(INBOX, 5)], { emailId: 'gm-1' }),
        ALL,
      ),
    );
    return messages.place(request(identityAt(at(ALL_MAIL, 40), 'archive'), null, ALL));
  };

  it('creates once and attaches the All Mail copy with the inbox mirror', async () => {
    const attached = await gmailMessage();

    expect(attached).toMatchObject({
      kind: 'attached',
      previous: [at(INBOX, 5)],
      claimed: NONE,
      message: { id: 'msg', mailboxId: INBOX, uid: 5 },
    });
    expect(stored('msg')?.placements).toEqual([at(ALL_MAIL, 40), at(INBOX, 5)]);
    expect(db.tables.messages.size).toBe(1);
    expect(db.tables.messageEffects.get('msg' as MessageId)).toEqual({ jira: NOW, invite: NOW });
  });

  it('refreshes, fills the email id, replaces a lower uid and ignores a stale one', async () => {
    await messages.upsert(placedMessage('msg', [at(INBOX, 5)]), new Map());

    expect(await messages.place(request(identityAt(at(INBOX, 5), 'inbox')))).toMatchObject({
      kind: 'refreshed',
      message: { emailId: 'gm-1' },
    });
    expect(await messages.place(request(identityAt(at(INBOX, 9), 'inbox')))).toMatchObject({
      kind: 'attached',
      message: { uid: 9, placements: [at(INBOX, 9)] },
    });
    expect(await messages.place(request(identityAt(at(INBOX, 7), 'inbox')))).toMatchObject({
      kind: 'refreshed',
      message: { uid: 9 },
    });
  });

  it('adopts placeholders like the SQL stores', async () => {
    const header = { messageIdHeader: '<msg@relay.test>' };
    await messages.upsert(
      placedMessage('pending', [at(INBOX, 0)], { messageIdHeader: '<msg@relay.test>' }),
      new Map(),
    );
    await messages.upsert(
      placedMessage('record', [at(SENT, 30)], { messageIdHeader: '<sent@relay.test>' }),
      new Map(),
    );

    expect(await messages.matchPlacement(identityAt(at(INBOX, 12), 'inbox', header))).toMatchObject(
      { kind: 'adopted', message: { id: 'pending' }, gates: NONE },
    );
    expect(await messages.place(request(identityAt(at(INBOX, 12), 'inbox', header)))).toMatchObject(
      { kind: 'adopted', message: { placements: [at(INBOX, 12)], emailId: 'gm-1' } },
    );
    expect(
      await messages.place(
        request(
          identityAt(at(SENT, 31), 'sent', {
            emailId: 'gm-2',
            messageIdHeader: '<sent@relay.test>',
          }),
        ),
      ),
    ).toMatchObject({ kind: 'adopted', message: { id: 'record', uid: 31, emailId: 'gm-2' } });
  });

  it('places a copy on the inbox keeper and reports a miss without writes', async () => {
    await messages.upsert(placedMessage('sent', [at(SENT, 3)], { emailId: 'gm-1' }), new Map());
    await messages.upsert(placedMessage('inbox', [at(INBOX, 8)], { emailId: 'gm-1' }), new Map());

    expect(await messages.place(request(identityAt(at(ALL_MAIL, 40), 'archive')))).toMatchObject({
      kind: 'attached',
      message: { id: 'inbox' },
    });
    expect(
      await messages.place(request(identityAt(at(ALL_MAIL, 41), 'archive', { emailId: 'gm-9' }))),
    ).toEqual({ kind: 'unmatched' });
    expect(db.tables.messages.size).toBe(2);
  });

  it('claims each gate once and keeps upsert away from the gates', async () => {
    await messages.upsert(placedMessage('msg', [at(SPAM, 2)], { emailId: 'gm-1' }), new Map());
    const inbox = identityAt(at(INBOX, 5), 'inbox');

    expect(await messages.place(request(inbox, null, { jira: true, invite: false }))).toMatchObject(
      { kind: 'attached', claimed: { jira: true, invite: false } },
    );
    expect(await messages.place(request(inbox, null, ALL))).toMatchObject({
      claimed: { jira: false, invite: true },
    });
    await messages.upsert(placedMessage('msg', [at(INBOX, 5)], { emailId: 'gm-1' }), new Map());
    expect(await messages.matchPlacement(inbox)).toMatchObject({ gates: ALL });
  });

  it('removes placements with the last-placement rule and lists known uids', async () => {
    await gmailMessage();
    await messages.movePlacement('msg' as MessageId, {
      from: INBOX,
      to: at(SPAM, 0),
      keepSource: true,
    });

    expect(await messages.listUids(SPAM)).toEqual([]);
    expect(await messages.deleteByUids(SPAM, [0])).toEqual([]);
    expect(await messages.deleteByUids(INBOX, [5])).toEqual(['thr_msg']);
    expect(stored('msg')).toMatchObject({ mailboxId: ALL_MAIL, uid: 40 });
    expect(await messages.removePlacement('msg' as MessageId, SPAM)).toEqual(['thr_msg']);
    expect(await messages.removePlacement('msg' as MessageId, SPAM)).toEqual([]);
    expect(await messages.forgetMailbox(ALL_MAIL)).toEqual(['thr_msg']);
    expect(stored('msg')).toBeUndefined();
    expect(db.tables.messageEffects.size).toBe(0);
  });

  it('moves placements without losing a known uid and rejects an occupied target', async () => {
    await gmailMessage();
    await messages.upsert(placedMessage('other', [at(SPAM, 7)]), new Map());

    await messages.movePlacement('msg' as MessageId, {
      from: INBOX,
      to: at(SENT, 3),
      keepSource: false,
    });
    await messages.movePlacement('msg' as MessageId, {
      from: ALL_MAIL,
      to: at(SENT, 0),
      keepSource: true,
    });

    expect(stored('msg')).toMatchObject({
      mailboxId: ALL_MAIL,
      uid: 40,
      placements: [at(ALL_MAIL, 40), at(SENT, 3)],
    });
    await expect(
      messages.movePlacement('msg' as MessageId, {
        from: SENT,
        to: at(SPAM, 7),
        keepSource: false,
      }),
    ).rejects.toThrow('Unique constraint failed');
  });
});
