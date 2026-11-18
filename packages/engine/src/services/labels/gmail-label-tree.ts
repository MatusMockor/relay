import type { AccountId } from '@relay/shared/domain';
import type { Repositories } from '../../ports/repositories';
import { recordProviderOps } from '../shared/provider-ops';

export interface LabelTreeMove {
  readonly from: string;
  readonly to: string;
  readonly delimiter: string;
}

const leafOf = (path: string, delimiter: string): string => path.split(delimiter).pop() ?? path;

const isWithin = (path: string, move: LabelTreeMove): boolean =>
  path === move.from || path.startsWith(`${move.from}${move.delimiter}`);

const movedPath = (path: string, move: LabelTreeMove): string =>
  `${move.to}${path.slice(move.from.length)}`;

const relocateLabels = async (
  repositories: Repositories,
  accountId: AccountId,
  move: LabelTreeMove,
): Promise<void> => {
  const labels = await repositories.labels.listByKind(accountId, 'gmail');
  for (const label of labels.filter((item) => isWithin(item.remoteName, move))) {
    const path = movedPath(label.remoteName, move);
    const mailbox = await repositories.mailboxes.findByPath(accountId, label.remoteName);
    if (mailbox !== null) {
      await repositories.mailboxes.relocate(mailbox.id, {
        path,
        name: leafOf(path, move.delimiter),
        delimiter: mailbox.delimiter,
      });
    }
    await repositories.labels.upsert({ ...label, name: path, remoteName: path });
  }
};

const retargetPendingWrites = async (
  repositories: Repositories,
  accountId: AccountId,
  move: LabelTreeMove,
): Promise<void> => {
  const ops = await repositories.pendingWork.list(accountId, 'provider-op');
  for (const op of ops) {
    const { change, messageId } = op.payload;
    if (change.kind !== 'label' || !isWithin(change.label, move)) {
      continue;
    }
    await repositories.pendingWork.remove([op]);
    const label = movedPath(change.label, move);
    await recordProviderOps(
      repositories.pendingWork,
      accountId,
      [{ messageId, change: { ...change, label } }],
      op.createdAt,
    );
  }
};

export const relocateLabelTree = async (
  repositories: Repositories,
  accountId: AccountId,
  move: LabelTreeMove,
): Promise<void> => {
  await relocateLabels(repositories, accountId, move);
  await retargetPendingWrites(repositories, accountId, move);
};
