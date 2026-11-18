import { GMAIL_CAPABILITIES, type StubMailbox, type StubMessage } from './gmail-stub-data';
import { quote, tokenize, uidSet } from './imap-wire';

const listLine = (verb: string, mailbox: StubMailbox): string =>
  `* ${verb} (${mailbox.flags.join(' ')}) "/" ${quote(mailbox.path)}`;

export const listResponse = (verb: string, mailboxes: readonly StubMailbox[]): string[] =>
  mailboxes.map((mailbox) => listLine(verb, mailbox));

const uidNextOf = (mailbox: StubMailbox): number =>
  Math.max(0, ...mailbox.messages.map(({ uid }) => uid)) + 1;

export const selectResponse = (mailbox: StubMailbox): string[] => [
  '* FLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen)',
  '* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Draft \\Deleted \\Seen \\*)] Flags permitted.',
  `* ${String(mailbox.messages.length)} EXISTS`,
  '* 0 RECENT',
  `* OK [UIDVALIDITY ${String(mailbox.uidValidity)}] UIDs valid.`,
  `* OK [UIDNEXT ${String(uidNextOf(mailbox))}] Predicted next UID.`,
];

export const statusResponse = (mailbox: StubMailbox): string[] => {
  const counts = [
    `MESSAGES ${String(mailbox.messages.length)}`,
    `UIDNEXT ${String(uidNextOf(mailbox))}`,
    `UIDVALIDITY ${String(mailbox.uidValidity)}`,
    'UNSEEN 0',
  ];
  return [`* STATUS ${quote(mailbox.path)} (${counts.join(' ')})`];
};

export const searchResponse = (mailbox: StubMailbox, args: readonly string[]): string[] => {
  const uids = mailbox.messages.map(({ uid }) => uid);
  const rangeIndex = args.findIndex((arg) => arg.toUpperCase() === 'UID');
  const range = rangeIndex === -1 ? undefined : args[rangeIndex + 1];
  const found = range === undefined ? uids : uidSet(range, uids);
  return [`* SEARCH ${found.join(' ')}`.trimEnd()];
};

const labelToken = (label: string): string => (label.startsWith('\\') ? label : quote(label));

const sourceOf = (message: StubMessage): string =>
  [
    'From: Sender <sender@relay.test>',
    'To: me@gmail.test',
    `Subject: ${message.subject}`,
    'Date: Sun, 15 Nov 2026 10:00:00 +0100',
    `Message-ID: <${message.msgId}@relay.test>`,
    '',
    'Hello.',
    '',
  ].join('\r\n');

const fetchItems = (message: StubMessage, line: string): string[] => {
  const upper = line.toUpperCase();
  const items = [`UID ${String(message.uid)}`, `FLAGS (${message.flags.join(' ')})`];
  if (upper.includes('X-GM-MSGID')) {
    items.push(`X-GM-MSGID ${message.msgId}`);
  }
  if (upper.includes('X-GM-LABELS')) {
    items.push(`X-GM-LABELS (${message.labels.map(labelToken).join(' ')})`);
  }
  if (upper.includes('INTERNALDATE')) {
    items.push('INTERNALDATE "15-Nov-2026 10:00:00 +0100"');
  }
  if (upper.includes('RFC822.SIZE')) {
    items.push(`RFC822.SIZE ${String(Buffer.byteLength(sourceOf(message)))}`);
  }
  if (upper.includes('BODY.PEEK[]') || upper.includes('BODY[]')) {
    const source = sourceOf(message);
    items.push(`BODY[] {${String(Buffer.byteLength(source))}}\r\n${source}`);
  }
  return items;
};

export const fetchResponse = (mailbox: StubMailbox, line: string): string[] => {
  const [, , , set = ''] = tokenize(line);
  const wanted = new Set(
    uidSet(
      set,
      mailbox.messages.map(({ uid }) => uid),
    ),
  );
  return mailbox.messages.flatMap((message, index) =>
    wanted.has(message.uid)
      ? [`* ${String(index + 1)} FETCH (${fetchItems(message, line).join(' ')})`]
      : [],
  );
};

export const capabilityResponse = (): string[] => [`* CAPABILITY ${GMAIL_CAPABILITIES}`];
