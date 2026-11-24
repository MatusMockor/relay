import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import { buildMailbox, mailboxId } from './fixtures';
import { type PlacementMailboxes, seedPlacementMailboxes } from './place-fixtures';
import { seedAccount, type SeededAccount } from './seed';
import type { TestStore } from './test-database';

export interface MergeMailboxes extends PlacementMailboxes {
  readonly label: Mailbox;
  readonly trash: Mailbox;
}

export interface MergeAccount {
  readonly seeded: SeededAccount;
  readonly boxes: MergeMailboxes;
}

export interface CopySpec {
  readonly id: string;
  readonly mailbox: Mailbox;
  readonly uid: number;
  readonly emailId?: string | null;
  readonly threadId?: string;
  readonly bodyState?: 'local' | 'remote';
  readonly textBody?: string | null;
  readonly htmlBody?: string | null;
  readonly snippet?: string;
  readonly seen?: boolean;
  readonly flagged?: boolean;
  readonly jira?: string | null;
  readonly invite?: string | null;
  readonly headers?: string;
  readonly attachments?: string;
}

export const MERGE_THREAD = 'thr-merge';

const COPY_SQL = `insert into messages (
  id, user_id, thread_id, account_id, mailbox_id, uid, message_id_header, email_id, "references",
  from_name, from_email, "to", cc, bcc, reply_to, subject, date, date_ts, snippet, text_body,
  html_body, seen, flagged, answered, attachments, headers, body_state, jira_effects_at,
  invite_effects_at
) values (
  @id, @userId, @threadId, @accountId, @mailboxId, @uid, @header, @emailId, '[]', 'Jana Nováková',
  'jana@klient.sk', '[]', '[]', '[]', '[]', 'Faktúra za november', '2026-11-20T08:00:00.000Z',
  1795161600000, @snippet, @textBody, @htmlBody, @seen, @flagged, 0, @attachments, @headers,
  @bodyState, @jira, @invite
)`;

const box = (seeded: SeededAccount, name: string, role: MailboxRole): Mailbox =>
  buildMailbox({
    id: mailboxId(`mbx-${role}`),
    accountId: seeded.account.id,
    name,
    path: name,
    role,
  });

export const seedMergeAccount = async (store: TestStore): Promise<MergeAccount> => {
  const seeded = await seedAccount(store.repositories);
  const placed = await seedPlacementMailboxes(store, seeded);
  const [label, trash] = await store.repositories.mailboxes.upsertMany(seeded.account.id, [
    box(seeded, 'Klienti', 'label'),
    box(seeded, 'Trash', 'trash'),
  ]);
  return {
    seeded,
    boxes: { ...placed, label: label ?? placed.allMail, trash: trash ?? placed.allMail },
  };
};

export const addPlacement = (store: TestStore, id: string, mailbox: Mailbox, uid: number): void => {
  store.database.sqlite
    .prepare('insert into message_placements (message_id, mailbox_id, uid) values (?, ?, ?)')
    .run(id, mailbox.id, uid);
};

export const insertCopy = (store: TestStore, account: MergeAccount, spec: CopySpec): void => {
  store.database.sqlite.prepare(COPY_SQL).run({
    id: spec.id,
    userId: account.seeded.account.userId,
    threadId: spec.threadId ?? MERGE_THREAD,
    accountId: account.seeded.account.id,
    mailboxId: spec.mailbox.id,
    uid: spec.uid,
    header: `<${spec.emailId ?? spec.id}@klient.sk>`,
    emailId: spec.emailId === undefined ? 'gm-1' : spec.emailId,
    snippet: spec.snippet ?? 'Posielam faktúru',
    textBody: spec.textBody === undefined ? 'Dobrý deň, posielam faktúru.' : spec.textBody,
    htmlBody: spec.htmlBody ?? null,
    seen: spec.seen === true ? 1 : 0,
    flagged: spec.flagged === true ? 1 : 0,
    attachments: spec.attachments ?? '[]',
    headers: spec.headers ?? '[]',
    bodyState: spec.bodyState ?? 'local',
    jira: spec.jira ?? null,
    invite: spec.invite ?? null,
  });
  addPlacement(store, spec.id, spec.mailbox, spec.uid);
};

export const insertGmailLabel = (store: TestStore, account: MergeAccount, name: string): string => {
  const id = `lbl-${name.toLowerCase()}`;
  store.database.sqlite
    .prepare(
      `insert into labels (id, account_id, name, color, kind, remote_name, name_key) values (?, ?, ?, null, 'gmail', ?, ?)`,
    )
    .run(id, account.seeded.account.id, name, name, name.toLowerCase());
  return id;
};

export const labelMessage = (store: TestStore, messageId: string, labelId: string): void => {
  store.database.sqlite
    .prepare('insert into message_labels (message_id, label_id) values (?, ?)')
    .run(messageId, labelId);
};
