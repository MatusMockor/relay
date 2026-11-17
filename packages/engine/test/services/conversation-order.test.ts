import type { AccountId, MailboxId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { conversationOrder } from '../../src/services/sync/conversation-order';
import type { MailboxWindow, WindowEntry } from '../../src/services/sync/initial-window';
import type { MailboxPass } from '../../src/services/sync/mailbox-synchronizer';

const PASS: MailboxPass = {
  mailbox: {
    id: 'mbx_inbox' as MailboxId,
    accountId: 'acc_1' as AccountId,
    name: 'INBOX',
    path: 'INBOX',
    delimiter: '/',
    role: 'inbox',
    unreadCount: 0,
    totalCount: 0,
  },
  role: 'inbox',
  state: null,
  status: {
    path: 'INBOX',
    uidValidity: 1,
    uidNext: 10,
    highestModseq: null,
    messages: 0,
    unseen: 0,
  },
};

const at = (date: number): string => `2026-11-${String(date).padStart(2, '0')}T08:00:00.000Z`;

interface EntrySpec {
  readonly uid: number;
  readonly arrived: number;
  readonly id?: string;
  readonly parents?: readonly string[];
  readonly subject?: string;
  readonly sent?: number;
}

const entry = (spec: EntrySpec): WindowEntry => ({
  pass: PASS,
  uid: spec.uid,
  arrivedAt: Date.parse(at(spec.arrived)),
  messageId: spec.id ?? null,
  parentIds: spec.parents ?? [],
  subject: spec.subject ?? `Subject ${String(spec.uid)}`,
  sentAt: at(spec.sent ?? spec.arrived),
  wanted: true,
});

const order = (entries: readonly WindowEntry[]): number[] => {
  const window: MailboxWindow = {
    pass: PASS,
    frozen: { floorUid: 1, cutoff: at(1) },
    topUid: 9,
    entries,
    done: 0,
    total: entries.length,
  };
  return conversationOrder([window]).map((item) => item.uid);
};

describe('conversationOrder', () => {
  it('puts parents before children by their links, using arrival only as a tie-break', () => {
    expect(
      order([
        entry({ uid: 1, arrived: 9, id: '<a>' }),
        entry({ uid: 2, arrived: 3, id: '<b>', parents: ['<a>'] }),
        entry({ uid: 3, arrived: 2, id: '<c>', parents: ['<a>', '<b>'] }),
        entry({ uid: 4, arrived: 5, id: '<x>' }),
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it('orders cycles and missing parents deterministically', () => {
    const entries = [
      entry({ uid: 1, arrived: 4, id: '<a>', parents: ['<b>'] }),
      entry({ uid: 2, arrived: 3, id: '<b>', parents: ['<a>'] }),
      entry({ uid: 3, arrived: 2, id: '<c>', parents: ['<missing>'] }),
      entry({ uid: 4, arrived: 1, id: '<d>', parents: ['<missing>'] }),
    ];

    expect(order(entries)).toEqual([2, 1, 4, 3]);
    expect(order([...entries].reverse())).toEqual([2, 1, 4, 3]);
  });

  it('attaches an unlinked reply to the closest earlier message of its subject within 14 days', () => {
    expect(
      order([
        entry({ uid: 1, arrived: 1, id: '<t1>', subject: 'Topic' }),
        entry({ uid: 2, arrived: 4, id: '<t2>', subject: 'Topic' }),
        entry({ uid: 3, arrived: 5, id: '<o>', subject: 'Other' }),
        entry({ uid: 4, arrived: 6, id: '<r>', subject: 'RE: topic', sent: 6 }),
        entry({ uid: 5, arrived: 28, id: '<late>', subject: 'Re: Other' }),
      ]),
    ).toEqual([5, 2, 4, 3, 1]);
  });

  it('gives a headerless reply with linked descendants the subject fallback', () => {
    expect(
      order([
        entry({ uid: 1, arrived: 1, id: '<a>', subject: 'Topic' }),
        entry({ uid: 2, arrived: 3, id: '<b>', subject: 'Re: Topic' }),
        entry({ uid: 3, arrived: 4, id: '<c>', subject: 'Re: Topic', parents: ['<b>'] }),
        entry({ uid: 4, arrived: 2, id: '<d>', subject: 'Other' }),
      ]),
    ).toEqual([1, 2, 3, 4]);
  });

  it('never links headerless replies with the same date to each other in a cycle', () => {
    const entries = [
      entry({ uid: 1, arrived: 1, id: '<a>', subject: 'Topic' }),
      entry({ uid: 2, arrived: 5, id: '<b>', subject: 'Re: Topic' }),
      entry({ uid: 3, arrived: 5, id: '<c>', subject: 'Re: Topic' }),
      entry({ uid: 4, arrived: 3, id: '<d>', subject: 'Other' }),
    ];

    expect(order(entries)).toEqual([1, 2, 3, 4]);
    expect(order([...entries].reverse())).toEqual([1, 3, 2, 4]);
  });
});
