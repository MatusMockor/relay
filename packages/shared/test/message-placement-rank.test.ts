import { describe, expect, it } from 'vitest';
import {
  isPendingPlacement,
  isPlacedIn,
  type MailboxId,
  type MailboxRole,
  type MailboxRoleOf,
  type MessagePlacement,
  PENDING_UID,
  placementIn,
  placementRank,
  primaryPlacement,
  rankedPlacements,
} from '../src/domain';

const id = (value: string) => value as MailboxId;

const ROLES = new Map<MailboxId, MailboxRole>([
  [id('mb-inbox'), 'inbox'],
  [id('mb-all'), 'archive'],
  [id('mb-label'), 'label'],
  [id('mb-sent'), 'sent'],
  [id('mb-trash'), 'trash'],
]);

const roleOf: MailboxRoleOf = (mailboxId) => ROLES.get(mailboxId);

const at = (mailboxId: string, uid: number): MessagePlacement => ({
  mailboxId: id(mailboxId),
  uid,
});

const placed = (placements: MessagePlacement[]) => ({
  mailboxId: id('mb-mirror'),
  uid: 7,
  placements,
});

describe('message placement rank', () => {
  it('orders real placements by mailbox role, unknown roles last', () => {
    const message = placed([
      at('mb-trash', 5),
      at('mb-unknown', 9),
      at('mb-sent', 4),
      at('mb-all', 3),
      at('mb-label', 6),
      at('mb-inbox', 2),
    ]);

    expect(rankedPlacements(message, roleOf).map(({ mailboxId }) => mailboxId)).toEqual([
      'mb-inbox',
      'mb-all',
      'mb-label',
      'mb-sent',
      'mb-trash',
      'mb-unknown',
    ]);
  });

  it('ranks a pending placement after every real one', () => {
    const pendingInbox = at('mb-inbox', PENDING_UID);
    const unknown = at('mb-unknown', 3);

    expect(isPendingPlacement(pendingInbox)).toBe(true);
    expect(placementRank(pendingInbox, roleOf)).toBeGreaterThan(placementRank(unknown, roleOf));
    expect(primaryPlacement(placed([pendingInbox, at('mb-trash', 8)]), roleOf)).toEqual(
      at('mb-trash', 8),
    );
  });

  it('breaks ties by mailbox id regardless of stored order', () => {
    const first = placed([at('mb-x', 1), at('mb-w', 2)]);
    const second = placed([at('mb-w', 2), at('mb-x', 1)]);

    expect(rankedPlacements(first, roleOf)).toEqual(rankedPlacements(second, roleOf));
    expect(primaryPlacement(first, roleOf)).toEqual(at('mb-w', 2));
  });

  it('falls back to the mirror when a message has no placements', () => {
    expect(primaryPlacement(placed([]), roleOf)).toEqual(at('mb-mirror', 7));
    expect(isPlacedIn(placed([]), id('mb-mirror'))).toBe(true);
  });

  it('finds the placement in a mailbox', () => {
    const message = placed([at('mb-inbox', 2), at('mb-all', 3)]);

    expect(placementIn(message, id('mb-all'))).toEqual(at('mb-all', 3));
    expect(placementIn(message, id('mb-mirror'))).toBeUndefined();
    expect(isPlacedIn(message, id('mb-inbox'))).toBe(true);
    expect(isPlacedIn(message, id('mb-trash'))).toBe(false);
  });
});
