import type { Mailbox } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';
import { type ReferenceWriter, referenceWriter } from './gmail-duplicates-references';
import type { MergeAccount } from './merge-seed';
import type { TestStore } from './test-database';

export interface DuplicatesFixture {
  readonly rows: number;
  readonly groups: number;
  readonly duplicateThreads: readonly string[];
}

interface CopyRow {
  readonly id: string;
  readonly mail: number;
  readonly mailbox: Mailbox;
  readonly emailId: string | null;
  readonly threadId: string;
}

const NEWEST_TS = 1_795_161_600_000;
const TEXT = 'Dobrý deň, v prílohe posielam faktúru za november a zmluvu o dielo. '.repeat(30);
const HTML = `<div><p>${'Dobrý deň, posielam faktúru a rozpočet projektu. '.repeat(40)}</p></div>`;
const LABEL_COUNT = 5;

const MESSAGE_SQL = `insert into messages (id, user_id, thread_id, account_id, mailbox_id, uid, message_id_header, email_id, "references", from_name, from_email, "to", cc, bcc, reply_to, subject, normalized_subject, date, date_ts, snippet, text_body, html_body, seen, flagged, answered, attachments, headers, body_state, jira_effects_at, invite_effects_at)
values (@id, @userId, @threadId, @accountId, @mailboxId, @uid, @header, @emailId, '[]', 'Jana Nováková', 'jana@klient.sk', '[]', '[]', '[]', '[]', @subject, @normalized, @date, @dateTs, 'Posielam faktúru', @text, @html, @seen, 0, 0, '[]', '[]', @bodyState, @date, @date)`;

const THREAD_SQL = `insert into threads (id, user_id, account_id, subject, participants, last_message_at, last_message_ts, message_count, unread, snippet, ai_one_liner, jira_key, jira_actor, label_ids, state, marked_done, remind_at, has_draft)
values (?, ?, ?, ?, '[]', ?, ?, ?, 0, 'Posielam faktúru', null, null, null, '[]', ?, 0, null, 0)`;

const threadOf = (mail: number): string => `thr-${String(Math.floor((mail * 2) / 5))}`;

const extraMailboxes = (mail: number, account: MergeAccount): Mailbox[] => {
  const { inbox, sent, label } = account.boxes;
  const extra: Mailbox[] = [];
  if (mail % 4 === 0) {
    extra.push(inbox);
  }
  if (mail % 10 === 1) {
    extra.push(sent);
  }
  if (mail % 10 === 5) {
    extra.push(label);
  }
  return extra;
};

const copiesOf = (mail: number, group: number, account: MergeAccount): CopyRow[] => {
  const emailId = `gm-${String(mail).padStart(7, '0')}`;
  const threadId = threadOf(mail);
  const base: CopyRow = {
    id: `m-${String(mail)}-a`,
    mail,
    mailbox: account.boxes.allMail,
    emailId,
    threadId,
  };
  const extra = extraMailboxes(mail, account).map(
    (mailbox, index): CopyRow => ({
      id: `m-${String(mail)}-${String(index)}`,
      mail,
      mailbox,
      emailId: group % 33 === 7 ? null : emailId,
      threadId: group % 200 === 13 ? threadOf(mail + 7) : threadId,
    }),
  );
  if (extra.length > 0 && group % 500 === 101) {
    extra.push({ ...base, id: `m-${String(mail)}-stale` });
  }
  return [base, ...extra];
};

const seedLabels = (store: TestStore, account: MergeAccount): string[] => {
  const insert = store.database.sqlite.prepare(
    `insert into labels (id, account_id, name, color, kind, remote_name, name_key) values (?, ?, ?, null, 'gmail', ?, ?)`,
  );
  return Array.from({ length: LABEL_COUNT }, (_, index) => {
    const name = `Projekt ${String(index)}`;
    insert.run(`lbl-${String(index)}`, account.seeded.account.id, name, name, name.toLowerCase());
    return `lbl-${String(index)}`;
  });
};

const writeThreads = (store: TestStore, account: MergeAccount, mails: number): void => {
  const insert = store.database.sqlite.prepare(THREAD_SQL);
  for (let thread = 0; thread <= Math.floor(((mails - 1) * 2) / 5); thread += 1) {
    const firstMail = Math.ceil((thread * 5) / 2);
    const ts = NEWEST_TS - firstMail * 60_000;
    const inbox = [0, 1, 2].some((offset) => {
      const mail = firstMail + offset;
      return threadOf(mail) === `thr-${String(thread)}` && mail % 4 === 0;
    });
    const subject = `Faktúra ${String(thread)}`;
    insert.run(
      `thr-${String(thread)}`,
      LOCAL_USER_ID,
      account.seeded.account.id,
      subject,
      new Date(ts).toISOString(),
      ts,
      2,
      inbox ? 'inbox' : 'done',
    );
  }
};

export const seedGmailDuplicates = (
  store: TestStore,
  account: MergeAccount,
  mails: number,
): DuplicatesFixture => {
  const { sqlite } = store.database;
  const insertMessage = sqlite.prepare(MESSAGE_SQL);
  const place = sqlite.prepare(
    'insert into message_placements (message_id, mailbox_id, uid) values (?, ?, ?)',
  );
  const label = sqlite.prepare('insert into message_labels (message_id, label_id) values (?, ?)');
  const uids = new Map<string, number>();
  const duplicateThreads = new Set<string>();
  let rows = 0;
  let groups = 0;
  sqlite.transaction(() => {
    const labelIds = seedLabels(store, account);
    const references: ReferenceWriter = referenceWriter(store, account);
    for (let mail = 0; mail < mails; mail += 1) {
      const copies = copiesOf(mail, groups, account);
      groups += copies.length > 1 ? 1 : 0;
      if (copies.length > 1 && duplicateThreads.size < 200) {
        duplicateThreads.add(threadOf(mail));
      }
      copies.forEach((copy) => {
        const uid = (uids.get(copy.mailbox.id) ?? 0) + 1;
        uids.set(copy.mailbox.id, uid);
        const remote = rows % 10 < 3;
        const ts = NEWEST_TS - mail * 60_000;
        insertMessage.run({
          id: copy.id,
          userId: LOCAL_USER_ID,
          threadId: copy.threadId,
          accountId: account.seeded.account.id,
          mailboxId: copy.mailbox.id,
          uid,
          header: `<${String(mail)}@klient.sk>`,
          emailId: copy.emailId,
          subject: `Faktúra ${String(mail)}`,
          normalized: `faktúra ${String(mail)}`,
          date: new Date(ts).toISOString(),
          dateTs: ts,
          text: remote ? null : `${TEXT} zmluva${String(mail % 1000)}`,
          html: remote ? null : HTML,
          seen: mail % 5 === 0 ? 0 : 1,
          bodyState: remote ? 'remote' : 'local',
        });
        place.run(copy.id, copy.mailbox.id, uid);
        Array.from({ length: (rows % 3) + 1 }, (_, index) => (rows + index) % LABEL_COUNT).forEach(
          (labelIndex) => {
            label.run(copy.id, labelIds[labelIndex]);
          },
        );
        references.write(copy.id, copy.threadId, rows);
        rows += 1;
      });
    }
    writeThreads(store, account, mails);
  })();
  return { rows, groups, duplicateThreads: [...duplicateThreads] };
};
