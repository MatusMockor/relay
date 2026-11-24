import type { IMAPServer, Mailbox, Message } from 'imapkit';

export interface MessageCopy {
  readonly mailbox: Mailbox;
  readonly message: Message;
}

const ALL_LABEL = '\\all';

const isString = (value: unknown): value is string => typeof value === 'string';

export const msgidOf = (message: Message): string => {
  const value: unknown = message['X-GM-MSGID'];
  return isString(value) ? value : '';
};

export const labelsOf = (message: Message): string[] => {
  const value: unknown = message['X-GM-LABELS'];
  return Array.isArray(value) ? value.filter(isString) : [];
};

export const withoutAllLabel = (labels: readonly string[]): string[] =>
  labels.filter((label) => label.toLowerCase() !== ALL_LABEL);

const bumpModseq = (mailbox: Mailbox, message: Message): void => {
  const highest = Math.max(Number(mailbox.HIGHESTMODSEQ) || 0, 1) + 1;
  mailbox.HIGHESTMODSEQ = highest;
  message.MODSEQ = highest;
};

export const writeLabels = (copy: MessageCopy, labels: readonly string[]): void => {
  const next = withoutAllLabel(labels);
  if (labelsOf(copy.message).join('\u0000') === next.join('\u0000')) {
    return;
  }
  copy.message['X-GM-LABELS'] = next;
  bumpModseq(copy.mailbox, copy.message);
};

export const selectableMailboxes = (server: IMAPServer): Mailbox[] =>
  server.control
    .listMailboxes()
    .filter((info) => info.selectable)
    .map((info) => server.getMailbox(info.path))
    .filter((mailbox): mailbox is Mailbox => mailbox !== undefined);

export const copiesOf = (server: IMAPServer, msgid: string): MessageCopy[] =>
  selectableMailboxes(server).flatMap((mailbox) =>
    mailbox.messages
      .filter((message) => message.ghost !== true && msgidOf(message) === msgid)
      .map((message) => ({ mailbox, message })),
  );

export const findCopy = (server: IMAPServer, path: string, uid: number): MessageCopy | null => {
  const mailbox = server.getMailbox(path);
  const message = mailbox?.messages.find((candidate) => candidate.uid === uid);
  if (mailbox === undefined || message === undefined) {
    return null;
  }
  return { mailbox, message };
};

export const isMailbox = (value: unknown): value is Mailbox =>
  typeof value === 'object' && value !== null && 'path' in value && 'messages' in value;
