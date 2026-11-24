import type { MailAccount, ThreadId, UserId } from '@relay/shared/domain';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { MailCopies } from '../shared/mail-copies';
import { PendingMoves } from '../shared/pending-moves';
import {
  publishThreadOutcomes,
  refreshThread,
  type ThreadRefreshOutcome,
} from '../shared/thread-refresh';
import { placementRolesOf } from '../sync/synced-thread-state';
import { emptyThreadWork, threadWorkHint } from '../sync/thread-refresh-work';

export interface FolderThreadRefresherDeps {
  readonly mailboxes: MailboxRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly unitOfWork: UnitOfWork;
  readonly events: EngineEvents;
}

export class FolderThreadRefresher {
  constructor(private readonly deps: FolderThreadRefresherDeps) {}

  async refresh(
    userId: UserId,
    account: MailAccount,
    threadIds: readonly ThreadId[],
  ): Promise<void> {
    if (threadIds.length === 0) {
      return;
    }
    const mailboxes = await this.deps.mailboxes.listForSync(account.id);
    const rolesOf = placementRolesOf(
      new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role])),
      await PendingMoves.load(this.deps.pendingWork, account.id),
    );
    const copies = MailCopies.of(account);
    const outcomes: ThreadRefreshOutcome[] = [];
    for (const threadId of new Set(threadIds)) {
      const hint = threadWorkHint(emptyThreadWork(threadId), rolesOf, copies);
      outcomes.push(
        await this.deps.unitOfWork.run((repositories) =>
          refreshThread(repositories, userId, account.id, threadId, hint),
        ),
      );
    }
    await publishThreadOutcomes(this.deps.events, userId, outcomes);
  }
}
