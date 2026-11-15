import type { AppendResult, FlagMutation, MoveResult } from '@relay/engine';
import type { MessageFlags } from '@relay/shared/domain';
import type { ImapFlow } from 'imapflow';
import type { ImapConnection } from './imap-connection';
import { requireAccepted } from './imap-results';
import { toImapFlags, toImapFlagsFromState } from './message-flags';
import { moveOnClient } from './message-move';
import { rollbackMove } from './move-rollback';
import { UncommittedCopyError } from './uncommitted-copy-error';

export interface FlagNames {
  readonly add: readonly string[];
  readonly remove: readonly string[];
}

export type FlagStoreClient = Pick<ImapFlow, 'messageFlagsAdd' | 'messageFlagsRemove'>;

const STORE = { operation: 'store flags', retryOnDisconnect: true } as const;
const MOVE = { operation: 'move', retryOnDisconnect: false } as const;

export const storeOnClient = async (
  client: FlagStoreClient,
  uids: readonly number[],
  flags: FlagNames,
): Promise<void> => {
  if (flags.add.length > 0) {
    requireAccepted(
      'store flags',
      await client.messageFlagsAdd([...uids], [...flags.add], { uid: true }),
    );
  }
  if (flags.remove.length > 0) {
    requireAccepted(
      'store flags',
      await client.messageFlagsRemove([...uids], [...flags.remove], { uid: true }),
    );
  }
};

export const storeFlags = async (
  connection: ImapConnection,
  path: string,
  uids: readonly number[],
  flags: FlagNames,
): Promise<void> => {
  if (uids.length === 0 || (flags.add.length === 0 && flags.remove.length === 0)) {
    return;
  }
  await connection.withMailbox(path, STORE, (client) => storeOnClient(client, uids, flags));
};

export const setFlags = (
  connection: ImapConnection,
  path: string,
  uids: readonly number[],
  mutation: FlagMutation,
): Promise<void> =>
  storeFlags(connection, path, uids, {
    add: toImapFlags(mutation.add),
    remove: toImapFlags(mutation.remove),
  });

export const moveMessages = async (
  connection: ImapConnection,
  path: string,
  uids: readonly number[],
  targetPath: string,
): Promise<MoveResult> => {
  if (uids.length === 0) {
    return { uidMap: new Map() };
  }
  return connection
    .withMailbox(path, MOVE, (client) => moveOnClient(client, uids, targetPath))
    .catch((error: unknown) => {
      if (!(error instanceof UncommittedCopyError)) {
        throw error;
      }
      return rollbackMove(connection, { sourcePath: path, targetPath, uids }, error);
    });
};

export const appendMessage = async (
  connection: ImapConnection,
  path: string,
  source: Uint8Array,
  flags: Partial<MessageFlags>,
): Promise<AppendResult> => {
  const result = await connection.run({ operation: 'append', retryOnDisconnect: false }, (client) =>
    client.append(path, Buffer.from(source), toImapFlagsFromState(flags)),
  );
  if (result === false) {
    return { uid: null, uidValidity: null };
  }
  return {
    uid: result.uid ?? null,
    uidValidity: result.uidValidity === undefined ? null : Number(result.uidValidity),
  };
};
