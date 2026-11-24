import { describe, expect, it } from 'vitest';
import { FRESH_COPY_MERGE_WORK, parseCopyMergeWork } from '../src/domain';

const progressed = {
  resolve: [{ mailboxId: 'mailbox-inbox', afterUid: 40 }],
  afterEmailId: '1789000000000000001',
  pass: { merged: 3, conflicts: 1, spanning: 0 },
  retryAfter: '2026-11-24T16:00:00.000Z',
};

describe('copy-merge work payload', () => {
  it('starts a fresh pass from the empty payload the migration seeds', () => {
    expect(parseCopyMergeWork({})).toEqual(FRESH_COPY_MERGE_WORK);
  });

  it('keeps a stored cursor and the pass counters', () => {
    expect(parseCopyMergeWork(progressed)).toEqual(progressed);
  });

  it('restarts the pass when any field is invalid', () => {
    expect(parseCopyMergeWork({ ...progressed, pass: { merged: -1 } })).toEqual(
      FRESH_COPY_MERGE_WORK,
    );
    expect(parseCopyMergeWork(null)).toEqual(FRESH_COPY_MERGE_WORK);
  });
});
