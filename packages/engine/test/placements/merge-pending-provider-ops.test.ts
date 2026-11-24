import type { ProviderChange } from '../../src';
import { describe, expect, it } from 'vitest';
import { remapPendingWork } from '../../src';
import { KEEPER, keyOf, LABEL, LOSER, OTHER, T1, T2, work } from '../support/merge-fixtures';
import { ALL_MAIL, at, INBOX } from '../support/placement-fixtures';

const SEEN: ProviderChange = { kind: 'flag', flag: 'seen', value: true };
const UNSEEN: ProviderChange = { kind: 'flag', flag: 'seen', value: false };
const ARCHIVE: ProviderChange = { kind: 'move', role: 'archive' };

const mapping = {
  keeperOf: new Map([
    [KEEPER, KEEPER],
    [LOSER, KEEPER],
  ]),
  primaryOf: new Map([
    [KEEPER, at(INBOX, 3)],
    [LOSER, at(LABEL, 8)],
  ]),
};

describe('pending provider ops on merge', () => {
  it("re-keys a loser's flag op to the keeper and keeps its revision", () => {
    const op = work('provider-op', `${LOSER}:flag:seen`, { messageId: LOSER, change: SEEN });

    const remap = remapPendingWork([op], mapping);

    expect(remap.remove).toEqual([keyOf(op)]);
    expect(remap.write).toEqual([
      { ...op, ref: `${KEEPER}:flag:seen`, payload: { messageId: KEEPER, change: SEEN } },
    ]);
  });

  it('keeps the later intent when two members changed the same flag, the keeper on a tie', () => {
    const kept = work(
      'provider-op',
      `${KEEPER}:flag:seen`,
      { messageId: KEEPER, change: SEEN },
      T1,
    );
    const later = work(
      'provider-op',
      `${LOSER}:flag:seen`,
      { messageId: LOSER, change: UNSEEN },
      T2,
    );
    const tied = work(
      'provider-op',
      `${LOSER}:flag:seen`,
      { messageId: LOSER, change: UNSEEN },
      T1,
    );

    const newer = remapPendingWork([kept, later], mapping);
    const tie = remapPendingWork([kept, tied], mapping);

    expect(newer.remove).toEqual([keyOf(kept), keyOf(later)]);
    expect(newer.write).toEqual([
      { ...later, ref: `${KEEPER}:flag:seen`, payload: { messageId: KEEPER, change: UNSEEN } },
    ]);
    expect(tie).toEqual({ remove: [keyOf(tied)], write: [] });
  });

  it('keeps the source of a move op and re-keys it under the keeper', () => {
    const source = at(ALL_MAIL, 12);
    const op = work('provider-op', `${LOSER}:move:${ALL_MAIL}`, {
      messageId: LOSER,
      change: ARCHIVE,
      source,
    });

    expect(remapPendingWork([op], mapping).write).toEqual([
      { ...op, ref: `${KEEPER}:move:${ALL_MAIL}`, payload: { ...op.payload, messageId: KEEPER } },
    ]);
  });

  it("gives a legacy move op the member's primary placement as its source", () => {
    const loser = work('provider-op', `${LOSER}:move`, { messageId: LOSER, change: ARCHIVE });
    const keeper = work('provider-op', `${KEEPER}:move`, { messageId: KEEPER, change: ARCHIVE });

    const remap = remapPendingWork([loser, keeper], mapping);

    expect(remap.remove).toEqual([keyOf(loser), keyOf(keeper)]);
    expect(remap.write.map((row) => [row.ref, row.payload])).toEqual([
      [`${KEEPER}:move:${LABEL}`, { messageId: KEEPER, change: ARCHIVE, source: at(LABEL, 8) }],
      [`${KEEPER}:move:${INBOX}`, { messageId: KEEPER, change: ARCHIVE, source: at(INBOX, 3) }],
    ]);
  });

  it('leaves rows of messages outside the merge and kinds without message ids alone', () => {
    const outside = work('provider-op', `${OTHER}:flag:seen`, { messageId: OTHER, change: SEEN });
    const rescan = work('label-rescan', ALL_MAIL, { mailboxId: ALL_MAIL });

    expect(remapPendingWork([outside, rescan], mapping)).toEqual({ remove: [], write: [] });
  });

  it('keeps the later move origin under the keeper', () => {
    const older = work('trash-origin', KEEPER, { messageId: KEEPER, role: 'inbox' }, T1);
    const newer = work('trash-origin', LOSER, { messageId: LOSER, role: 'archive' }, T2);

    const remap = remapPendingWork([older, newer], mapping);

    expect(remap.remove).toEqual([keyOf(older), keyOf(newer)]);
    expect(remap.write).toEqual([
      { ...newer, ref: KEEPER, payload: { messageId: KEEPER, role: 'archive' } },
    ]);
  });
});
