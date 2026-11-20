import { describe, expect, it } from 'vitest';
import { ServerSearchRequestSchema, ServerSearchResponseSchema } from '../src/api';

const thread = {
  id: 'thr_1',
  accountId: 'acc_1',
  subject: 'DPH 09/2025',
  participants: [{ name: 'Mária Hollá', email: 'maria@example.sk' }],
  lastMessageAt: '2025-10-12T08:00:00.000Z',
  messageCount: 1,
  unread: false,
  snippet: 'V prílohe posielam DPH',
  aiOneLiner: null,
  jiraKey: null,
  splitIds: [],
  labelIds: [],
  state: 'done',
  remindAt: null,
  hasDraft: false,
};

describe('ServerSearchRequestSchema', () => {
  it('accepts a request with filters and trims the query', () => {
    const parsed = ServerSearchRequestSchema.parse({
      requestId: 'r1',
      q: '  dph ',
      accountId: 'acc_1',
      searchField: 'subject',
      hasAttachment: true,
      unread: false,
    });

    expect(parsed.q).toBe('dph');
    expect(parsed.searchField).toBe('subject');
  });

  it('rejects an empty query, a missing request id and an unknown field', () => {
    expect(ServerSearchRequestSchema.safeParse({ requestId: 'r1', q: '   ' }).success).toBe(false);
    expect(ServerSearchRequestSchema.safeParse({ q: 'dph' }).success).toBe(false);
    expect(
      ServerSearchRequestSchema.safeParse({ requestId: 'r1', q: 'dph', searchField: 'body' })
        .success,
    ).toBe(false);
  });
});

describe('ServerSearchResponseSchema', () => {
  it.each(['ok', 'partial', 'offline', 'skipped', 'unsupported'] as const)(
    'accepts the %s status',
    (status) => {
      expect(
        ServerSearchResponseSchema.safeParse({ requestId: 'r1', status, hits: [] }).success,
      ).toBe(true);
    },
  );

  it('validates hits with a thread summary, message id and date', () => {
    const hit = { thread, messageId: 'msg_1', date: '2025-10-12T08:00:00.000Z' };

    expect(
      ServerSearchResponseSchema.safeParse({ requestId: 'r1', status: 'ok', hits: [hit] }).success,
    ).toBe(true);
    expect(
      ServerSearchResponseSchema.safeParse({
        requestId: 'r1',
        status: 'ok',
        hits: [{ ...hit, date: 'včera' }],
      }).success,
    ).toBe(false);
    expect(
      ServerSearchResponseSchema.safeParse({ requestId: 'r1', status: 'failed', hits: [] }).success,
    ).toBe(false);
  });
});
