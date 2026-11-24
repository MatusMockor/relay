import type { MailAccount, Mailbox, ThreadState } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';
import type { TestStore } from './test-database';

export interface BulkMailboxes {
  readonly inbox: Mailbox;
  readonly archive: Mailbox;
  readonly sent: Mailbox;
  readonly folder: Mailbox;
  readonly tiny: Mailbox;
  readonly single: Mailbox;
}

export interface BulkSeedInput {
  readonly account: MailAccount;
  readonly mailboxes: BulkMailboxes;
  readonly count: number;
  readonly newestTs: number;
}

const STATES: readonly ThreadState[] = [
  'done',
  'inbox',
  'done',
  'done',
  'inbox',
  'done',
  'inbox',
  'done',
  'trash',
  'spam',
];

const stateOf = (index: number): ThreadState => STATES[index % STATES.length] ?? 'done';

const mailboxOf = (index: number, state: ThreadState, input: BulkSeedInput): Mailbox => {
  const { mailboxes } = input;
  if (index === input.count - 10) {
    return mailboxes.single;
  }
  if (index % 10_000 === 5) {
    return mailboxes.tiny;
  }
  if (index % 7 === 0) {
    return mailboxes.folder;
  }
  if (state === 'inbox') {
    return mailboxes.inbox;
  }
  return mailboxes.archive;
};

const THREAD_SQL = `insert into threads (id, user_id, account_id, subject, participants, last_message_at, last_message_ts, message_count, unread, snippet, ai_one_liner, jira_key, jira_actor, label_ids, state, marked_done, remind_at, has_draft) values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, null, null, null, ?, ?, ?, null, 0)`;

const MESSAGE_SQL = `insert into messages (id, user_id, thread_id, account_id, mailbox_id, uid, message_id_header, email_id, in_reply_to, "references", from_name, from_email, "to", cc, bcc, reply_to, subject, normalized_subject, date, date_ts, snippet, text_body, html_body, seen, flagged, answered, attachments, headers) values (?, ?, ?, ?, ?, ?, ?, null, null, '[]', 'Jana Nováková', 'jana@klient.sk', '[]', '[]', '[]', '[]', ?, ?, ?, ?, ?, null, null, ?, 0, 0, '[]', '{}')`;

export const BULK_LABEL_ID = 'lbl-bulk';

export const BULK_SEARCH_TERM = 'Faktúra';

const BULK_LABEL_IDS = JSON.stringify([BULK_LABEL_ID]);

const PARTICIPANTS = JSON.stringify([{ name: 'Jana Nováková', email: 'jana@klient.sk' }]);

export const bulkSeedThreads = (store: TestStore, input: BulkSeedInput): void => {
  const { sqlite } = store.database;
  const insertThread = sqlite.prepare(THREAD_SQL);
  const insertMessage = sqlite.prepare(MESSAGE_SQL);
  const prefix = input.account.id;
  sqlite.transaction(() => {
    for (let index = 0; index < input.count; index += 1) {
      const id = `${prefix}-t${String(index).padStart(7, '0')}`;
      const ts = input.newestTs - index * 60_000 - (index % 3);
      const iso = new Date(ts).toISOString();
      const state = stateOf(index);
      const subject = `${index % 100 === 0 ? BULK_SEARCH_TERM : 'Správa'} číslo ${String(index)}`;
      const unread = index % 5 === 0 ? 1 : 0;
      insertThread.run(
        id,
        LOCAL_USER_ID,
        input.account.id,
        subject,
        PARTICIPANTS,
        iso,
        ts,
        unread,
        'Krátky úryvok správy',
        index % 13 === 0 ? BULK_LABEL_IDS : '[]',
        state,
        state === 'done' && index % 4 === 0 ? 1 : 0,
      );
      const mailbox = mailboxOf(index, state, input);
      insertMessage.run(
        `${id}-m`,
        LOCAL_USER_ID,
        id,
        input.account.id,
        mailbox.id,
        index + 1,
        `<${id}@klient.sk>`,
        subject,
        subject.toLowerCase(),
        iso,
        ts,
        'Krátky úryvok správy',
        unread === 1 ? 0 : 1,
      );
      if (index % 4 === 1) {
        insertMessage.run(
          `${id}-s`,
          LOCAL_USER_ID,
          id,
          input.account.id,
          input.mailboxes.sent.id,
          index + 1,
          `<${id}-s@firma.sk>`,
          subject,
          subject.toLowerCase(),
          iso,
          ts,
          'Odpoveď',
          1,
        );
      }
    }
  })();
};
