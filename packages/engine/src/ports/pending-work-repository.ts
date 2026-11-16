import type { AccountId } from '@relay/shared/domain';
import type {
  PendingWork,
  PendingWorkInput,
  PendingWorkKey,
  PendingWorkKind,
  PendingWorkPayloads,
} from '../model/pending-work';

export interface PendingWorkRepository {
  put<Kind extends PendingWorkKind>(work: PendingWorkInput<Kind>): Promise<PendingWork<Kind>>;
  replace<Kind extends PendingWorkKind>(
    work: PendingWork<Kind>,
    payload: PendingWorkPayloads[Kind],
  ): Promise<PendingWork<Kind> | null>;
  find<Kind extends PendingWorkKind>(key: PendingWorkKey<Kind>): Promise<PendingWork<Kind> | null>;
  list<Kind extends PendingWorkKind>(
    accountId: AccountId,
    kind: Kind,
  ): Promise<PendingWork<Kind>[]>;
  listByKind<Kind extends PendingWorkKind>(kind: Kind): Promise<PendingWork<Kind>[]>;
  remove(works: readonly PendingWork[]): Promise<number>;
}
