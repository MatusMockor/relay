import type { ParsedMessage } from '@relay/engine';

export const parsedMessage = (overrides: Partial<ParsedMessage> = {}): ParsedMessage => ({
  messageIdHeader: '<m1@relay.test>',
  inReplyTo: null,
  references: [],
  from: { name: 'Sender', email: 'sender@relay.test' },
  to: [{ name: null, email: 'matus@relay.test' }],
  cc: [],
  bcc: [],
  replyTo: [],
  subject: 'Hello',
  date: '2026-11-15T10:00:00.000Z',
  textBody: 'Body',
  htmlBody: null,
  snippet: 'Body',
  headers: new Map(),
  attachments: [],
  ...overrides,
});
