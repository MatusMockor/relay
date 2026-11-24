import { describe, expect, it } from 'vitest';
import { MessageSchema } from '../src/domain';

const wireMessage = {
  id: 'message-1',
  threadId: 'thread-1',
  accountId: 'account-1',
  mailboxId: 'mailbox-inbox',
  uid: 42,
  messageIdHeader: '<one@example.com>',
  emailId: null,
  inReplyTo: null,
  references: [],
  from: { name: 'Eva', email: 'eva@example.com' },
  to: [],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: 'Hello',
  date: '2026-11-24T10:00:00.000Z',
  snippet: 'Hello',
  textBody: 'Hello',
  htmlBody: null,
  flags: { seen: false, flagged: false, answered: false },
  labelIds: [],
  attachments: [],
};

describe('message placements', () => {
  it('derives the primary placement for peers that do not send placements', () => {
    expect(MessageSchema.parse(wireMessage).placements).toEqual([
      { mailboxId: 'mailbox-inbox', uid: 42 },
    ]);
  });

  it('keeps the placements a peer sends', () => {
    const placements = [
      { mailboxId: 'mailbox-inbox', uid: 42 },
      { mailboxId: 'mailbox-all', uid: 0 },
    ];

    expect(MessageSchema.parse({ ...wireMessage, placements }).placements).toEqual(placements);
  });

  it('rejects a message without any placement', () => {
    expect(MessageSchema.safeParse({ ...wireMessage, placements: [] }).success).toBe(false);
  });
});
