import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { mergeMappingOf, planGroupMerge, verdictOf } from '../../src';
import { KEEPER, LABEL, LOSER, member, OTHER } from '../support/merge-fixtures';
import { ALL_MAIL, at, INBOX, SENT } from '../support/placement-fixtures';

describe('group merge plan', () => {
  it('ignores a group with a single message', () => {
    expect(verdictOf([member(KEEPER)])).toBe('single');
    expect(planGroupMerge([])).toEqual({ verdict: 'single' });
  });

  it('skips a group that spans threads', () => {
    const elsewhere = member(LOSER, { threadId: 'thr_other' as ThreadId });

    expect(planGroupMerge([member(KEEPER), elsewhere])).toEqual({ verdict: 'spans-threads' });
  });

  it('skips a group with two known UIDs in one mailbox', () => {
    const first = member(KEEPER, { placements: [at(ALL_MAIL, 4)] });
    const second = member(LOSER, { placements: [at(ALL_MAIL, 9)] });

    expect(verdictOf([first, second])).toBe('mailbox-conflict');
  });

  it('merges a pending and a known placement in one mailbox', () => {
    const pending = member(KEEPER, { placements: [at(ALL_MAIL, 0)] });
    const known = member(LOSER, { placements: [at(ALL_MAIL, 9)] });

    expect(verdictOf([pending, known])).toBe('merge');
  });

  it('plans the keeper, the losers, the donor and the surviving placements', () => {
    const inbox = member(KEEPER, { order: 3, placements: [at(INBOX, 7)], bodyState: 'remote' });
    const archived = member(LOSER, { order: 1, placements: [at(ALL_MAIL, 20)] });
    const labelled = member(OTHER, { order: 2, placements: [at(LABEL, 5), at(SENT, 0)] });

    const decision = planGroupMerge([archived, inbox, labelled]);

    expect(decision.verdict).toBe('merge');
    if (decision.verdict !== 'merge') {
      return;
    }
    expect(decision.plan.keeper.id).toBe(KEEPER);
    expect(decision.plan.losers.map((loser) => loser.id)).toEqual([LOSER, OTHER]);
    expect(decision.plan.donor.id).toBe(LOSER);
    expect(decision.plan.placements.kept.map((owned) => owned.placement)).toEqual([
      at(ALL_MAIL, 20),
      at(INBOX, 7),
      at(LABEL, 5),
      at(SENT, 0),
    ]);
    expect(decision.plan.placements.dropped).toEqual([]);

    const mapping = mergeMappingOf([decision.plan]);
    expect([...mapping.keeperOf]).toEqual([
      [KEEPER, KEEPER],
      [LOSER, KEEPER],
      [OTHER, KEEPER],
    ]);
    expect(mapping.primaryOf.get(OTHER)).toEqual(at(LABEL, 5));
  });
});
