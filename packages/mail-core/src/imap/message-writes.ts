import type { AppendResult, FlagMutation, MoveResult } from '@relay/engine';
import type { MessageFlags } from '@relay/shared/domain';
import type { ImapConnection } from './imap-connection';
import { toImapFlags, toImapFlagsFromState } from './message-flags';

export interface FlagNames {
  readonly add: readonly string[];
  readonly remove: readonly string[];
}

const STORE = { operation: 'store flags', retryOnDisconnect: true } as const;

export const storeFlags = async (
  connection: ImapConnection,
  path: string,
  uids: readonly number[],
  flags: FlagNames,
): Promise<void> => {
  if (uids.length === 0 || (flags.add.length === 0 && flags.remove.length === 0)) {
    return;
  }
  await connection.withMailbox(path, STORE, async (client) => {
    if (flags.add.length > 0) {
      await client.messageFlagsAdd([...uids], [...flags.add], { uid: true });
    }
    if (flags.remove.length > 0) {
      await client.messageFlagsRemove([...uids], [...flags.remove], { uid: true });
    }
  });
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
  const result = await connection.withMailbox(
    path,
    { operation: 'move', retryOnDisconnect: false },
    (client) => client.messageMove([...uids], targetPath, { uid: true }),
  );
  if (result === false) {
    return { uidMap: new Map() };
  }
  return { uidMap: new Map(result.uidMap ?? []) };
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
