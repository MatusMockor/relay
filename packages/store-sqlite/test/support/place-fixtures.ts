import type { EffectGates, PlacementIdentity, PlaceRequest } from '@relay/engine';
import {
  type Mailbox,
  type MailboxRole,
  type Message,
  type MessagePlacement,
  primaryPlacement,
} from '@relay/shared/domain';
import { expect } from 'vitest';
import { buildMailbox, buildMessage, mailboxId, messageId, NO_HEADERS } from './fixtures';
import type { SeededAccount } from './seed';
import type { TestStore } from './test-database';

export const PLACED_AT = '2026-11-24T09:00:00.000Z';
export const ALL_GATES: EffectGates = { jira: true, invite: true };
export const NO_GATES: EffectGates = { jira: false, invite: false };

export interface PlacementMailboxes {
  readonly inbox: Mailbox;
  readonly sent: Mailbox;
  readonly allMail: Mailbox;
  readonly spam: Mailbox;
}

export const seedPlacementMailboxes = async (
  store: TestStore,
  seeded: SeededAccount,
): Promise<PlacementMailboxes> => {
  const extra = (name: string, role: MailboxRole) =>
    buildMailbox({
      id: mailboxId(`mbx-${role}`),
      accountId: seeded.account.id,
      name,
      path: name,
      role,
    });
  const [allMail, spam] = await store.repositories.mailboxes.upsertMany(seeded.account.id, [
    extra('All Mail', 'archive'),
    extra('Spam', 'spam'),
  ]);
  expect(allMail).toBeDefined();
  expect(spam).toBeDefined();
  return {
    inbox: seeded.inbox,
    sent: seeded.sent,
    allMail: allMail ?? seeded.inbox,
    spam: spam ?? seeded.inbox,
  };
};

export const at = (mailbox: Mailbox, uid: number): MessagePlacement => ({
  mailboxId: mailbox.id,
  uid,
});

export const gmailIdentity = (
  seeded: SeededAccount,
  mailbox: Mailbox,
  uid: number,
  overrides: Partial<PlacementIdentity> = {},
): PlacementIdentity => ({
  accountId: seeded.account.id,
  location: at(mailbox, uid),
  role: mailbox.role,
  emailId: 'gm-1',
  labelBased: true,
  messageIdHeader: null,
  ...overrides,
});

export const newMessage = (
  seeded: SeededAccount,
  id: string,
  location: MessagePlacement,
  overrides: Partial<Message> = {},
): Message =>
  buildMessage({
    id: messageId(id),
    accountId: seeded.account.id,
    mailboxId: location.mailboxId,
    uid: location.uid,
    messageIdHeader: `<${id}@klient.sk>`,
    ...overrides,
  });

export const placeRequest = (
  identity: PlacementIdentity,
  create: Message | null,
  claims: EffectGates = NO_GATES,
): PlaceRequest => ({
  ...identity,
  create: create === null ? null : { message: create, headers: NO_HEADERS },
  claims,
  at: PLACED_AT,
});

interface StoredState {
  readonly mailboxId: string;
  readonly uid: number;
  readonly jira: string | null;
  readonly invite: string | null;
}

export const storedState = (store: TestStore, id: string): StoredState | undefined =>
  store.database.sqlite
    .prepare<
      [string],
      StoredState
    >('select mailbox_id as mailboxId, uid, jira_effects_at as jira, invite_effects_at as invite from messages where id = ?')
    .get(id);

export const expectMirrorParity = (
  store: TestStore,
  mailboxes: PlacementMailboxes,
  message: Message | null,
): void => {
  expect(message).not.toBeNull();
  if (message === null) {
    return;
  }
  const { inbox, sent, allMail, spam } = mailboxes;
  const roles = new Map([inbox, sent, allMail, spam].map((mailbox) => [mailbox.id, mailbox.role]));
  const primary = primaryPlacement(message, (id) => roles.get(id));
  expect(storedState(store, message.id)).toMatchObject(primary);
  expect({ mailboxId: message.mailboxId, uid: message.uid }).toEqual(primary);
};

export const messageCount = (store: TestStore): number =>
  store.database.sqlite
    .prepare<[], { count: number }>('select count(*) as count from messages')
    .get()?.count ?? 0;
