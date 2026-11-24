import type {
  AccountId,
  MailboxId,
  MailboxRole,
  Message,
  MessageId,
  MessagePlacement,
  ThreadId,
} from '@relay/shared/domain';
import type { PlacementIdentity } from '../../src';

export const ACCOUNT = 'acc_placements' as AccountId;
export const INBOX = 'mbx_inbox' as MailboxId;
export const ALL_MAIL = 'mbx_all' as MailboxId;
export const SENT = 'mbx_sent' as MailboxId;
export const SPAM = 'mbx_spam' as MailboxId;

export const at = (mailboxId: MailboxId, uid: number): MessagePlacement => ({ mailboxId, uid });

export const placedMessage = (
  id: string,
  placements: readonly MessagePlacement[],
  overrides: Partial<Message> = {},
): Message => {
  const [primary = at(INBOX, 1)] = placements;
  return {
    id: id as MessageId,
    threadId: `thr_${id}` as ThreadId,
    accountId: ACCOUNT,
    mailboxId: primary.mailboxId,
    uid: primary.uid,
    messageIdHeader: `<${id}@relay.test>`,
    emailId: null,
    inReplyTo: null,
    references: [],
    from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
    to: [{ name: null, email: 'jan@firma.sk' }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: 'Faktúra za október',
    date: '2026-11-10T10:00:00.000Z',
    snippet: 'Dobrý deň',
    textBody: 'Dobrý deň, posielam faktúru.',
    htmlBody: null,
    flags: { seen: false, flagged: false, answered: false },
    labelIds: [],
    attachments: [],
    placements: [...placements],
    ...overrides,
  };
};

export const identityAt = (
  location: MessagePlacement,
  role: MailboxRole,
  overrides: Partial<PlacementIdentity> = {},
): PlacementIdentity => ({
  accountId: ACCOUNT,
  location,
  role,
  emailId: 'gm-1',
  labelBased: true,
  messageIdHeader: null,
  ...overrides,
});
