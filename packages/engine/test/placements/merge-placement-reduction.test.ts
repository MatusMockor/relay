import { describe, expect, it } from 'vitest';
import { reducePlacements } from '../../src';
import { KEEPER, LABEL, LOSER, member, OTHER } from '../support/merge-fixtures';
import { ALL_MAIL, at, INBOX } from '../support/placement-fixtures';

describe('placement reduction', () => {
  it('keeps a known UID over a pending placement in the same mailbox', () => {
    const reduction = reducePlacements(
      [
        member(KEEPER, { placements: [at(INBOX, 3), at(ALL_MAIL, 0)] }),
        member(LOSER, { placements: [at(ALL_MAIL, 12)] }),
      ],
      KEEPER,
    );

    expect(reduction.kept).toEqual([
      { messageId: KEEPER, placement: at(INBOX, 3) },
      { messageId: LOSER, placement: at(ALL_MAIL, 12) },
    ]);
    expect(reduction.dropped).toEqual([{ messageId: KEEPER, placement: at(ALL_MAIL, 0) }]);
  });

  it("keeps the keeper's pending placement, then the oldest message's", () => {
    const reduction = reducePlacements(
      [
        member(OTHER, { order: 1, placements: [at(LABEL, 0)] }),
        member(LOSER, { order: 2, placements: [at(LABEL, 0), at(ALL_MAIL, 0)] }),
        member(KEEPER, { order: 3, placements: [at(ALL_MAIL, 0)] }),
      ],
      KEEPER,
    );

    expect(reduction.kept).toEqual([
      { messageId: OTHER, placement: at(LABEL, 0) },
      { messageId: KEEPER, placement: at(ALL_MAIL, 0) },
    ]);
    expect(reduction.dropped).toEqual([
      { messageId: LOSER, placement: at(LABEL, 0) },
      { messageId: LOSER, placement: at(ALL_MAIL, 0) },
    ]);
  });
});
