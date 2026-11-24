import type { EffectGates, PlacementIdentity, PlaceRequest } from '@relay/engine';
import {
  type AccountId,
  type Mailbox,
  type Message,
  type MessageId,
  type MessagePlacement,
  primaryPlacement,
  type ThreadSummary,
} from '@relay/shared/domain';
import { eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';
import type { DbExecutor } from '../../../src/persistence/database/database';
import { messages } from '../../../src/persistence/schema';
import {
  buildMailbox,
  buildMessage,
  buildThread,
  mailboxByRole,
  type SeededAccount,
} from './fixtures';

export const PLACED_AT = '2026-11-24T09:00:00.000Z';
export const ALL_GATES: EffectGates = { jira: true, invite: true };
export const NO_GATES: EffectGates = { jira: false, invite: false };
export const NO_HEADERS = new Map<string, readonly string[]>();

export interface PlacementMailboxes {
  readonly inbox: Mailbox;
  readonly sent: Mailbox;
  readonly allMail: Mailbox;
  readonly spam: Mailbox;
}

export interface PlacementScene {
  readonly seeded: SeededAccount;
  readonly boxes: PlacementMailboxes;
  readonly thread: ThreadSummary;
}

export const seedPlacementScene = async (
  repositories: ServerRepositories,
  seeded: SeededAccount,
): Promise<PlacementScene> => {
  const stored = await repositories.mailboxes.upsertMany(seeded.account.id, [
    buildMailbox(seeded.account.id, 'archive', { name: 'All Mail', path: '[Gmail]/All Mail' }),
    buildMailbox(seeded.account.id, 'spam', { name: 'Spam', path: '[Gmail]/Spam' }),
  ]);
  return {
    seeded,
    thread: buildThread(seeded.account.id),
    boxes: {
      ...seeded.mailboxes,
      allMail: mailboxByRole(stored, 'archive'),
      spam: mailboxByRole(stored, 'spam'),
    },
  };
};

const boxList = (boxes: PlacementMailboxes): Mailbox[] => [
  boxes.inbox,
  boxes.sent,
  boxes.allMail,
  boxes.spam,
];

export const at = (mailbox: Mailbox, uid: number): MessagePlacement => ({
  mailboxId: mailbox.id,
  uid,
});

export const sortedPlacements = (placements: readonly MessagePlacement[]): MessagePlacement[] =>
  [...placements].sort((left, right) => (left.mailboxId < right.mailboxId ? -1 : 1));

export const gmailIdentity = (
  scene: PlacementScene,
  mailbox: Mailbox,
  uid: number,
  overrides: Partial<PlacementIdentity> = {},
): PlacementIdentity => ({
  accountId: scene.seeded.account.id,
  location: at(mailbox, uid),
  role: mailbox.role,
  emailId: 'gm-1',
  labelBased: true,
  messageIdHeader: null,
  ...overrides,
});

export const newMessage = (
  scene: PlacementScene,
  location: MessagePlacement,
  overrides: Partial<Message> = {},
): Message => {
  const mailbox = boxList(scene.boxes).find((box) => box.id === location.mailboxId);
  expect(mailbox).toBeDefined();
  return buildMessage(scene.thread, mailbox ?? scene.boxes.inbox, {
    uid: location.uid,
    placements: [location],
    ...overrides,
  });
};

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

export interface StoredState {
  readonly mailboxId: string;
  readonly uid: number;
  readonly jira: string | null;
  readonly invite: string | null;
}

export const storedState = async (
  db: DbExecutor,
  messageId: MessageId,
): Promise<StoredState | undefined> => {
  const [row] = await db
    .select({
      mailboxId: messages.mailboxId,
      uid: messages.uid,
      jira: messages.jiraEffectsAt,
      invite: messages.inviteEffectsAt,
    })
    .from(messages)
    .where(eq(messages.id, messageId));
  return row === undefined
    ? undefined
    : {
        mailboxId: row.mailboxId,
        uid: row.uid,
        jira: row.jira?.toISOString() ?? null,
        invite: row.invite?.toISOString() ?? null,
      };
};

export const expectMirrorParity = async (
  db: DbExecutor,
  boxes: PlacementMailboxes,
  message: Message | null,
): Promise<void> => {
  expect(message).not.toBeNull();
  if (message === null) {
    return;
  }
  const roles = new Map(boxList(boxes).map((mailbox) => [mailbox.id, mailbox.role]));
  const primary = primaryPlacement(message, (id) => roles.get(id));
  expect(await storedState(db, message.id)).toMatchObject(primary);
  expect({ mailboxId: message.mailboxId, uid: message.uid }).toEqual(primary);
};

export const messageCount = async (db: DbExecutor, accountId: AccountId): Promise<number> => {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from messages where account_id = ${accountId}`,
  );
  return result.rows[0]?.count ?? 0;
};

export const searchHits = async (
  db: DbExecutor,
  accountId: AccountId,
  word: string,
): Promise<number> => {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from messages
        where account_id = ${accountId}
          and search_vector @@ plainto_tsquery('simple', relay_search_text(${word}))`,
  );
  return result.rows[0]?.count ?? 0;
};

export interface PlacementRow extends Record<string, unknown> {
  readonly messageId: string;
  readonly mailboxId: string;
  readonly uid: number;
}

export const placementRows = async (
  db: DbExecutor,
  accountId: AccountId,
): Promise<PlacementRow[]> => {
  const result = await db.execute<PlacementRow>(
    sql`select mp.message_id as "messageId", mp.mailbox_id as "mailboxId", mp.uid::int as uid
        from message_placements mp
        inner join messages m on m.id = mp.message_id
        where m.account_id = ${accountId}
        order by mp.message_id collate "C", mp.mailbox_id collate "C"`,
  );
  return result.rows;
};
