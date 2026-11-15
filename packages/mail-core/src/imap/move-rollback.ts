import { type MoveResult, PartialMoveError, ProviderError } from '@relay/engine';
import type { ImapFlow, MailboxObject } from 'imapflow';
import { hasCapability } from './imap-capabilities';
import type { ImapConnection } from './imap-connection';
import { requireAccepted } from './imap-results';
import { searchUids, sortedUids } from './uid-batches';
import type { UncommittedCopyError } from './uncommitted-copy-error';

export interface FailedMove {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly uids: readonly number[];
}

type SourceState = 'intact' | 'moved' | 'partial';

const ROLLBACK = { operation: 'move rollback', retryOnDisconnect: true } as const;

const requireUidValidity = (mailbox: MailboxObject, expected: bigint): void => {
  if (mailbox.uidValidity === expected) {
    return;
  }
  throw new ProviderError(`UIDVALIDITY of ${mailbox.path} changed before the move was rolled back`);
};

const restoreSource = async (client: ImapFlow, uids: readonly number[]): Promise<SourceState> => {
  requireAccepted(
    'store flags',
    await client.messageFlagsRemove([...uids], ['\\Deleted'], { uid: true }),
  );
  const present = await searchUids(client, { uid: uids.join(','), deleted: false });
  if (present.length === 0) {
    return 'moved';
  }
  if (present.length < uids.length) {
    return 'partial';
  }
  return 'intact';
};

const deleteCopies = async (client: ImapFlow, copies: readonly number[]): Promise<number[]> => {
  if (!hasCapability(client, 'UIDPLUS')) {
    throw new ProviderError('IMAP server lost UIDPLUS, the copies cannot be expunged by UID');
  }
  requireAccepted('expunge', await client.messageDelete([...copies], { uid: true }));
  return searchUids(client, { uid: copies.join(',') });
};

const copiesOf = (uids: readonly number[], uidMap: ReadonlyMap<number, number>): number[] =>
  uids.flatMap((uid) => {
    const copy = uidMap.get(uid);
    return copy === undefined ? [] : [copy];
  });

export const rollbackMove = async (
  connection: ImapConnection,
  move: FailedMove,
  failure: UncommittedCopyError,
): Promise<MoveResult> => {
  const { uidMap, sourceUidValidity, targetUidValidity } = failure.copy;
  const uids = sortedUids(move.uids);
  const partial = (cause: unknown) =>
    new PartialMoveError(move.sourcePath, move.targetPath, uidMap, { cause });
  const copies = copiesOf(uids, uidMap);
  if (sourceUidValidity === null || targetUidValidity === null || copies.length < uids.length) {
    throw partial(failure);
  }
  const source = await connection
    .withMailbox(move.sourcePath, ROLLBACK, (client, mailbox) => {
      requireUidValidity(mailbox, sourceUidValidity);
      return restoreSource(client, uids);
    })
    .catch((error: unknown) => {
      throw partial(error);
    });
  if (source === 'moved') {
    return { uidMap };
  }
  if (source === 'partial') {
    throw partial(failure);
  }
  const remaining = await connection
    .withMailbox(move.targetPath, ROLLBACK, (client, mailbox) => {
      requireUidValidity(mailbox, targetUidValidity);
      return deleteCopies(client, copies);
    })
    .catch((error: unknown) => {
      throw partial(error);
    });
  const leftover = new ProviderError(
    `IMAP EXPUNGE left ${String(remaining.length)} of ${String(copies.length)} copies in ${move.targetPath}`,
  );
  if (remaining.length === copies.length) {
    throw partial(leftover);
  }
  if (remaining.length > 0) {
    throw leftover;
  }
  throw new ProviderError(
    `IMAP move from ${move.sourcePath} to ${move.targetPath} failed and the copies were rolled back: ${failure.message}`,
    { cause: failure.cause },
  );
};
