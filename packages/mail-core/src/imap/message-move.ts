import { ProviderError, type MoveResult } from '@relay/engine';
import type { CopyResponseObject, ImapFlow } from 'imapflow';
import { requireAccepted } from './imap-results';
import { UncommittedCopyError } from './uncommitted-copy-error';

export type MoveClient = Pick<
  ImapFlow,
  'capabilities' | 'mailbox' | 'messageMove' | 'messageCopy' | 'messageFlagsAdd' | 'messageDelete'
>;

const UNSAFE_MOVE_MESSAGE =
  'IMAP server supports neither MOVE nor UIDPLUS, so moving would need an unscoped EXPUNGE that can permanently delete other messages marked as deleted';

const toMoveResult = (result: CopyResponseObject): MoveResult => ({
  uidMap: new Map(result.uidMap ?? []),
});

const removeSource = async (client: MoveClient, uids: readonly number[]): Promise<void> => {
  requireAccepted(
    'store flags',
    await client.messageFlagsAdd([...uids], ['\\Deleted'], { uid: true }),
  );
  requireAccepted('expunge', await client.messageDelete([...uids], { uid: true }));
};

export const moveOnClient = async (
  client: MoveClient,
  uids: readonly number[],
  targetPath: string,
): Promise<MoveResult> => {
  if (client.capabilities.has('MOVE')) {
    const moved = await client.messageMove([...uids], targetPath, { uid: true });
    return toMoveResult(requireAccepted('move', moved));
  }
  if (!client.capabilities.has('UIDPLUS')) {
    throw new ProviderError(UNSAFE_MOVE_MESSAGE);
  }
  const sourceUidValidity = client.mailbox === false ? null : client.mailbox.uidValidity;
  const copied = requireAccepted(
    'copy',
    await client.messageCopy([...uids], targetPath, { uid: true }),
  );
  const result = toMoveResult(copied);
  await removeSource(client, uids).catch((error: unknown) => {
    throw new UncommittedCopyError(
      {
        uidMap: result.uidMap,
        sourceUidValidity,
        targetUidValidity: copied.uidValidity ?? null,
      },
      error,
    );
  });
  return result;
};
