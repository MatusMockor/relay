export interface StubMessage {
  readonly uid: number;
  readonly msgId: string;
  readonly labels: readonly string[];
  readonly flags: readonly string[];
  readonly subject: string;
}

export interface StubMailbox {
  readonly path: string;
  readonly flags: readonly string[];
  readonly uidValidity: number;
  readonly messages: readonly StubMessage[];
}

export const GMAIL_CAPABILITIES = 'IMAP4rev1 X-GM-EXT-1 UIDPLUS CHILDREN SPECIAL-USE';

const message = (
  uid: number,
  msgId: string,
  labels: readonly string[],
  subject: string,
): StubMessage => ({ uid, msgId, labels, flags: ['\\Seen'], subject });

const mailbox = (
  path: string,
  flags: readonly string[],
  uidValidity: number,
  messages: readonly StubMessage[] = [],
): StubMailbox => ({ path, flags, uidValidity, messages });

export const gmailMailboxes = (): StubMailbox[] => [
  mailbox('INBOX', ['\\HasNoChildren'], 1, [
    message(1, '1790000000000000001', ['\\Inbox', '\\Important', 'Projekty/Alfa'], 'Alfa'),
    message(2, '1790000000000000002', ['\\Inbox', 'Fakt&APo-ry'], 'Faktura'),
  ]),
  mailbox('[Gmail]', ['\\HasChildren', '\\Noselect'], 0),
  mailbox('[Gmail]/All Mail', ['\\All', '\\HasNoChildren'], 11, [
    message(5, '1790000000000000001', ['\\Inbox', '\\Important', 'Projekty/Alfa'], 'Alfa'),
    message(6, '1790000000000000002', ['\\Inbox', 'Fakt&APo-ry'], 'Faktura'),
    message(7, '1790000000000000003', ['Archive', '"VIP"'], 'Archived'),
  ]),
  mailbox('[Gmail]/Drafts', ['\\Drafts', '\\HasNoChildren'], 12),
  mailbox('[Gmail]/Important', ['\\HasNoChildren', '\\Important'], 13),
  mailbox('[Gmail]/Sent Mail', ['\\HasNoChildren', '\\Sent'], 14),
  mailbox('[Gmail]/Spam', ['\\HasNoChildren', '\\Junk'], 15),
  mailbox('[Gmail]/Starred', ['\\Flagged', '\\HasNoChildren'], 16),
  mailbox('[Gmail]/Trash', ['\\HasNoChildren', '\\Trash'], 17),
  mailbox('Archive', ['\\HasNoChildren'], 18),
  mailbox('Fakt&APo-ry', ['\\HasNoChildren'], 19),
  mailbox('Projekty', ['\\HasChildren'], 20),
  mailbox('Projekty/Alfa', ['\\HasNoChildren'], 21),
];
