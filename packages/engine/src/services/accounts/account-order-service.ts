import type { AccountId, MailAccount, UserId } from '@relay/shared/domain';
import { ConflictError } from '../../errors';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { assertCompleteOrder } from './account-order';

export interface AccountOrderServiceDeps {
  readonly unitOfWork: UnitOfWork;
  readonly events: EngineEvents;
}

export class AccountOrderService {
  constructor(private readonly deps: AccountOrderServiceDeps) {}

  async reorder(userId: UserId, orderedIds: readonly AccountId[]): Promise<MailAccount[]> {
    const reordered = await this.deps.unitOfWork.run(async ({ accounts }) => {
      assertCompleteOrder(await accounts.listByUserForUpdate(userId), orderedIds);
      const written = await accounts.reorder(userId, orderedIds);
      if (written !== orderedIds.length) {
        throw new ConflictError('The accounts changed while they were being reordered');
      }
      return accounts.listByUser(userId);
    });
    await this.deps.events.emit(userId, 'accounts.reordered', {
      accountIds: reordered.map((account) => account.id),
    });
    return reordered;
  }
}
