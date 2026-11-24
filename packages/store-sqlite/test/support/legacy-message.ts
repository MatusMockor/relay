import type { Mailbox, UserId } from '@relay/shared/domain';
import type { SqliteDatabase } from '../../src';

export interface LegacyMessage {
  readonly id: string;
  readonly userId: UserId;
  readonly mailbox: Mailbox;
  readonly uid: number;
  readonly textBody?: string | null;
  readonly date?: string;
}

const LEGACY_MESSAGE_SQL = `insert into messages (
  id, user_id, thread_id, account_id, mailbox_id, uid, message_id_header, "references", "to",
  cc, bcc, reply_to, subject, date, date_ts, snippet, text_body, seen, flagged, answered,
  attachments, headers
) values (?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', 'Stará pošta', ?, ?, 'Starý mail',
  ?, 0, 0, 0, '[]', '[]')`;

export const insertLegacyMessage = (database: SqliteDatabase, message: LegacyMessage): void => {
  const date = message.date ?? '2024-05-01T08:00:00.000Z';
  database.sqlite
    .prepare(LEGACY_MESSAGE_SQL)
    .run(
      message.id,
      message.userId,
      `thr-${message.id}`,
      message.mailbox.accountId,
      message.mailbox.id,
      message.uid,
      `<${message.id}@klient.sk>`,
      date,
      Date.parse(date),
      message.textBody ?? null,
    );
};
