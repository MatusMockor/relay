import {
  type LabelId,
  type Mailbox,
  type Message,
  type MessageId,
  MessageIdSchema,
  type MessagePlacement,
  type ThreadSummary,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';
import type { DbExecutor } from '../../../src/persistence/database/database';
import {
  buildMailbox,
  buildMessage,
  buildThread,
  mailboxByRole,
  newId,
  seedAccount,
  type SeededAccount,
} from './fixtures';

export interface MergeMailboxes {
  readonly inbox: Mailbox;
  readonly sent: Mailbox;
  readonly allMail: Mailbox;
  readonly work: Mailbox;
  readonly spam: Mailbox;
}

export interface MergeScene {
  readonly seeded: SeededAccount;
  readonly boxes: MergeMailboxes;
  readonly thread: ThreadSummary;
  readonly db: DbExecutor;
  readonly repositories: ServerRepositories;
}

export interface MergeContext {
  readonly db: DbExecutor;
  readonly repositories: ServerRepositories;
}

export const seedMergeScene = async ({ db, repositories }: MergeContext): Promise<MergeScene> => {
  const seeded = await seedAccount(repositories);
  const accountId = seeded.account.id;
  const stored = await repositories.mailboxes.upsertMany(accountId, [
    buildMailbox(accountId, 'archive', { name: 'All Mail', path: '[Gmail]/All Mail' }),
    buildMailbox(accountId, 'label', { name: 'Work', path: 'Work' }),
    buildMailbox(accountId, 'spam', { name: 'Spam', path: '[Gmail]/Spam' }),
  ]);
  const thread = await repositories.threads.upsert(buildThread(accountId));
  return {
    seeded,
    db,
    repositories,
    thread,
    boxes: {
      ...seeded.mailboxes,
      allMail: mailboxByRole(stored, 'archive'),
      work: mailboxByRole(stored, 'label'),
      spam: mailboxByRole(stored, 'spam'),
    },
  };
};

export const placed = (mailbox: Mailbox, uid: number): MessagePlacement => ({
  mailboxId: mailbox.id,
  uid,
});

export const legacyCopy = async (
  scene: MergeScene,
  location: MessagePlacement,
  overrides: Partial<Message> = {},
): Promise<Message> => {
  const { inbox, sent, allMail, work, spam } = scene.boxes;
  const mailbox =
    [inbox, sent, allMail, work, spam].find((box) => box.id === location.mailboxId) ?? inbox;
  const message = buildMessage(scene.thread, mailbox, {
    emailId: 'gm-1',
    uid: location.uid,
    placements: [location],
    ...overrides,
  });
  return scene.repositories.messages.upsert(message, new Map());
};

export const seedGmailLabel = async (scene: MergeScene, remoteName: string): Promise<LabelId> => {
  const id = newId('label');
  await scene.db
    .execute(sql`insert into labels (id, user_id, account_id, name, kind, remote_name, name_key)
    values (${id}, ${scene.seeded.user.id}, ${scene.seeded.account.id}, ${remoteName}, 'gmail',
      ${remoteName}, ${remoteName.toLowerCase()})`);
  return id;
};

export const mergeAll = (scene: MergeScene, emailIds: readonly string[]) =>
  scene.repositories.messageMerges.merge(
    scene.seeded.account.id,
    emailIds.map((emailId) => ({ emailId, size: 2 })),
  );

export const addPlacement = async (
  scene: MergeScene,
  messageId: string,
  location: MessagePlacement,
): Promise<void> => {
  await scene.db.execute(sql`insert into message_placements (message_id, mailbox_id, uid)
    values (${messageId}, ${location.mailboxId}, ${location.uid})`);
};

export const bulkCopies = async (
  scene: MergeScene,
  options: { readonly prefix: string; readonly rows: number; readonly perGroup: number | null },
): Promise<void> => {
  const { seeded, boxes, thread } = scene;
  const emailId =
    options.perGroup === null
      ? sql`null`
      : sql`${options.prefix} || lpad((((n - 1) / ${options.perGroup}) + 1)::text, 6, '0')`;
  await scene.db
    .execute(sql`insert into messages (id, user_id, account_id, mailbox_id, thread_id, uid,
      "references", to_addresses, cc_addresses, bcc_addresses, reply_to_addresses, subject, date,
      snippet, seen, flagged, answered, attachments, headers, email_id)
    select ${newId('message')} || '_' || n, ${seeded.user.id}, ${seeded.account.id}, ${boxes.allMail.id},
      ${thread.id}, (select coalesce(max(uid), 0) from messages) + n, '{}', '[]', '[]', '[]', '[]',
      'Hromadne', now(), '', false, false, false, '[]', '{}', ${emailId}
    from generate_series(1, ${options.rows}::int) as n`);
};

export const suffixedId = (base: MessageId, suffix: string): MessageId =>
  MessageIdSchema.parse(`${base}_${suffix}`);
