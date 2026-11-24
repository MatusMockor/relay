import type { AccountId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  normalizeSubject,
  ReferencesThreadResolver,
  type SubjectWindow,
  type ThreadLookup,
} from '../../src';
import { SequentialIdGenerator } from '../support/infrastructure';
import { parsedMessage } from '../support/parsed-message';

interface IndexedMessage {
  readonly accountId: AccountId;
  readonly threadId: ThreadId;
  readonly messageId: string;
  readonly inReplyTo?: string;
  readonly subject: string;
  readonly date: string;
}

class InMemoryThreadLookup implements ThreadLookup {
  constructor(private readonly messages: readonly IndexedMessage[]) {}

  findByMessageIds(accountId: AccountId, messageIds: readonly string[]): Promise<ThreadId | null> {
    const match = messageIds
      .map((id) => this.messages.find((m) => m.accountId === accountId && m.messageId === id))
      .find((message) => message !== undefined);
    return Promise.resolve(match?.threadId ?? null);
  }

  findByReplyTo(accountId: AccountId, messageIds: readonly string[]): Promise<ThreadId | null> {
    const match = this.messages.find(
      (m) =>
        m.accountId === accountId && m.inReplyTo !== undefined && messageIds.includes(m.inReplyTo),
    );
    return Promise.resolve(match?.threadId ?? null);
  }

  findBySubject(accountId: AccountId, window: SubjectWindow): Promise<ThreadId | null> {
    const match = this.messages.find(
      (m) =>
        m.accountId === accountId &&
        normalizeSubject(m.subject).value === window.normalizedSubject &&
        Date.parse(m.date) >= window.since.getTime() &&
        Date.parse(m.date) <= window.until.getTime(),
    );
    return Promise.resolve(match?.threadId ?? null);
  }
}

const accountId = 'acc_1' as AccountId;
const existing: IndexedMessage[] = [
  {
    accountId,
    threadId: 'thread_a' as ThreadId,
    messageId: '<root@x>',
    subject: 'Plán',
    date: '2026-11-10T10:00:00Z',
  },
  {
    accountId,
    threadId: 'thread_b' as ThreadId,
    messageId: '<other@x>',
    subject: 'Rozpočet 2027',
    date: '2026-11-12T10:00:00Z',
  },
  {
    accountId,
    threadId: 'thread_d' as ThreadId,
    messageId: '<child@x>',
    inReplyTo: '<late-parent@x>',
    subject: 'Re: Ponuka',
    date: '2026-11-12T10:00:00Z',
  },
  {
    accountId: 'acc_2' as AccountId,
    threadId: 'thread_c' as ThreadId,
    messageId: '<foreign@x>',
    subject: 'Cudzí',
    date: '2026-11-12T10:00:00Z',
  },
];

const resolver = () =>
  new ReferencesThreadResolver(new InMemoryThreadLookup(existing), new SequentialIdGenerator(), {
    subjectWindowDays: 7,
  });

describe('ReferencesThreadResolver', () => {
  it('joins the thread of the In-Reply-To message', async () => {
    const message = parsedMessage({
      messageIdHeader: '<r1@x>',
      inReplyTo: '<root@x>',
      references: ['<root@x>'],
    });

    expect(await resolver().resolve(accountId, message)).toEqual({
      threadId: 'thread_a',
      isNew: false,
    });
  });

  it('falls back to References when the direct parent is unknown', async () => {
    const message = parsedMessage({
      inReplyTo: '<missing@x>',
      references: ['<root@x>', '<missing@x>'],
    });

    expect(await resolver().resolve(accountId, message)).toEqual({
      threadId: 'thread_a',
      isNew: false,
    });
  });

  it('joins the thread of a stored reply when its parent arrives later', async () => {
    const message = parsedMessage({ messageIdHeader: '<late-parent@x>', subject: 'Ponuka' });

    expect(await resolver().resolve(accountId, message)).toEqual({
      threadId: 'thread_d',
      isNew: false,
    });
  });

  it('joins a sibling reply that answers the same missing parent', async () => {
    const message = parsedMessage({
      messageIdHeader: '<sibling@x>',
      inReplyTo: '<late-parent@x>',
      references: ['<late-parent@x>'],
      subject: 'Iná téma',
    });

    expect(await resolver().resolve(accountId, message)).toEqual({
      threadId: 'thread_d',
      isNew: false,
    });
  });

  it('matches a reply by normalized subject inside the time window', async () => {
    const message = parsedMessage({
      subject: 'RE: Fwd: [EXTERNAL] Rozpočet  2027',
      date: '2026-11-14T10:00:00Z',
    });

    expect(await resolver().resolve(accountId, message)).toEqual({
      threadId: 'thread_b',
      isNew: false,
    });
  });

  it('starts a new thread for an old subject match, a non-reply, or another account', async () => {
    const tooOld = parsedMessage({ subject: 'Re: Rozpočet 2027', date: '2026-12-30T10:00:00Z' });
    const notReply = parsedMessage({ subject: 'Rozpočet 2027', date: '2026-11-14T10:00:00Z' });
    const foreign = parsedMessage({ inReplyTo: '<foreign@x>' });
    const instance = resolver();

    expect(await instance.resolve(accountId, tooOld)).toEqual({
      threadId: 'thread_1',
      isNew: true,
    });
    expect(await instance.resolve(accountId, notReply)).toEqual({
      threadId: 'thread_2',
      isNew: true,
    });
    expect(await instance.resolve(accountId, foreign)).toEqual({
      threadId: 'thread_3',
      isNew: true,
    });
  });
});

describe('normalizeSubject', () => {
  it.each([
    ['Re: Re: Ahoj', 'ahoj', true],
    ['AW: WG: Termin', 'termin', true],
    ['Odp: Fwd: Faktúra', 'faktúra', true],
    ['RE[2]: Status', 'status', true],
    ['[EXTERNAL] Hello', 'hello', false],
    ['[JIRA] (WEB-1) Bug', '[jira] (web-1) bug', false],
    ['Ahoj   svet', 'ahoj svet', false],
  ])('normalizes "%s"', (input, value, hadReplyPrefix) => {
    expect(normalizeSubject(input)).toEqual({ value, hadReplyPrefix });
  });

  it('handles pathological prefix chains without recursion', () => {
    const result = normalizeSubject(`${'Re: '.repeat(15_000)}subject`);

    expect(result.hadReplyPrefix).toBe(true);
    expect(result.value.length).toBeLessThanOrEqual(1_000);
  });
});
