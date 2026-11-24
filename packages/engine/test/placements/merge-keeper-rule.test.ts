import { describe, expect, it } from 'vitest';
import { donorOf, keeperOf, mergedGates } from '../../src';
import { KEEPER, LOSER, member, OTHER, T1, T2 } from '../support/merge-fixtures';
import { ALL_MAIL, at, INBOX } from '../support/placement-fixtures';

describe('merge keeper rule', () => {
  it('keeps the inbox copy even when another copy is older', () => {
    const older = member(LOSER, { order: 1 });
    const inbox = member(KEEPER, { order: 5, placements: [at(INBOX, 9)] });

    expect(keeperOf([older, inbox]).id).toBe(KEEPER);
  });

  it('keeps the oldest copy when none is in the inbox', () => {
    const newer = member(LOSER, { order: 7 });
    const oldest = member(KEEPER, { order: 2 });

    expect(keeperOf([newer, oldest, member(OTHER, { order: 3 })]).id).toBe(KEEPER);
  });

  it('takes the content of a local body over a remote one', () => {
    const keeper = member(KEEPER, { bodyState: 'remote', bodyLength: 900 });
    const local = member(LOSER, { bodyState: 'local', bodyLength: 10 });

    expect(donorOf([keeper, local], keeper).id).toBe(LOSER);
  });

  it('takes the longer body, and the keeper on a tie', () => {
    const keeper = member(KEEPER, { order: 1, bodyLength: 50 });
    const longer = member(LOSER, { order: 2, bodyLength: 80 });
    const same = member(OTHER, { order: 0, bodyLength: 50 });

    expect(donorOf([keeper, longer], keeper).id).toBe(LOSER);
    expect(donorOf([same, keeper], keeper).id).toBe(KEEPER);
  });

  it('keeps the earliest effect gate of the group per effect', () => {
    const gates = mergedGates([
      member(KEEPER, { gates: { jiraEffectsAt: null, inviteEffectsAt: T2 } }),
      member(LOSER, { gates: { jiraEffectsAt: T2, inviteEffectsAt: T1 } }),
      member(OTHER, { gates: { jiraEffectsAt: T1, inviteEffectsAt: null } }),
    ]);

    expect(gates).toEqual({ jiraEffectsAt: T1, inviteEffectsAt: T1 });
    expect(mergedGates([member(KEEPER), member(LOSER, { placements: [at(ALL_MAIL, 2)] })])).toEqual(
      { jiraEffectsAt: null, inviteEffectsAt: null },
    );
  });
});
