import type { JiraKey, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { type MessageEffectsWork, remapPendingWork } from '../../src';
import { KEEPER, keyOf, LOSER, MERGE_THREAD, OTHER, T1, T2, work } from '../support/merge-fixtures';
import { at, INBOX } from '../support/placement-fixtures';

const mapping = {
  keeperOf: new Map([
    [KEEPER, KEEPER],
    [LOSER, KEEPER],
    [OTHER, KEEPER],
  ]),
  primaryOf: new Map([[KEEPER, at(INBOX, 3)]]),
};

const effects = (overrides: Partial<MessageEffectsWork>): MessageEffectsWork => ({
  messageId: KEEPER,
  threadId: MERGE_THREAD,
  publish: false,
  arrival: false,
  jira: null,
  headers: [],
  ...overrides,
});

const jira = { jiraKey: 'REL-1' as JiraKey, eventKind: 'comment' as const, actor: null };

describe('pending message work on merge', () => {
  it("ORs arrival, publish and live into the keeper's message effects", () => {
    const kept = work('message-effects', KEEPER, effects({ headers: [['x-keeper', ['1']]] }));
    const arrived = work('message-effects', LOSER, effects({ messageId: LOSER, arrival: true }));
    const live = work(
      'message-effects',
      OTHER,
      effects({ messageId: OTHER, publish: true, live: true }),
    );

    const remap = remapPendingWork([kept, arrived, live], mapping);

    expect(remap.remove).toEqual([keyOf(kept), keyOf(arrived), keyOf(live)]);
    expect(remap.write).toEqual([
      { ...kept, payload: { ...kept.payload, publish: true, arrival: true, live: true } },
    ]);
  });

  it("keeps the keeper's Jira event and re-keys a loser's when the keeper has none", () => {
    const payload = { threadId: MERGE_THREAD, classification: jira, title: 'REL-1' };
    const kept = work('jira-event', KEEPER, payload, T2);
    const loser = work('jira-event', LOSER, payload, T1);

    expect(remapPendingWork([kept, loser], mapping)).toEqual({ remove: [keyOf(loser)], write: [] });
    expect(remapPendingWork([loser], mapping).write).toEqual([{ ...loser, ref: KEEPER }]);
  });

  it("re-keys a loser's calendar invite and rewrites its message id", () => {
    const invite = work('calendar-invite', LOSER, {
      messageId: LOSER,
      threadId: MERGE_THREAD,
      mailboxRole: 'inbox',
      parts: ['BEGIN:VCALENDAR'],
      publish: true,
      attempts: 0,
      nextAttemptAt: null,
      failedAt: null,
      lastError: null,
    });

    expect(remapPendingWork([invite], mapping).write).toEqual([
      { ...invite, ref: KEEPER, payload: { ...invite.payload, messageId: KEEPER } },
    ]);
  });

  it('rewrites the message id of a parked calendar reply without changing its ref', () => {
    const ref = JSON.stringify(['uid-1', null, 'jana@klient.sk']);
    const reply = work('calendar-reply', ref, {
      uid: 'uid-1',
      recurrenceId: null,
      sequence: 0,
      dtstamp: null,
      attendee: { name: null, email: 'jana@klient.sk', partstat: 'accepted', role: null },
      messageId: LOSER,
      parkedAt: T1,
    });

    expect(remapPendingWork([reply], mapping)).toEqual({
      remove: [keyOf(reply)],
      write: [{ ...reply, payload: { ...reply.payload, messageId: KEEPER } }],
    });
  });

  it('keeps the oldest loser row when the keeper has none', () => {
    const part = (messageId: typeof LOSER, createdAt: string) =>
      work(
        'calendar-rebuild-part',
        messageId,
        { messageId, threadId: 'thr_x' as ThreadId, mailboxRole: 'inbox', date: T1, parts: [] },
        createdAt,
      );
    const later = part(OTHER, T2);
    const earlier = part(LOSER, T1);

    const remap = remapPendingWork([later, earlier], mapping);

    expect(remap.remove).toEqual([keyOf(later), keyOf(earlier)]);
    expect(remap.write).toEqual([
      { ...earlier, ref: KEEPER, payload: { ...earlier.payload, messageId: KEEPER } },
    ]);
  });
});
