import type { Mailbox, ThreadId } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { LabelRescans } from './label-rescans';
import type { SyncContext } from './sync-context';

export interface MailboxForgetterDeps {
  readonly messages: MessageRepository;
  readonly syncStates: SyncStateRepository;
  readonly unitOfWork: UnitOfWork;
  readonly rescans: LabelRescans;
}

export class MailboxForgetter {
  constructor(private readonly deps: MailboxForgetterDeps) {}

  async forget(context: Pick<SyncContext, 'journal'>, mailbox: Mailbox): Promise<ThreadId[]> {
    const threadIds = await this.deps.unitOfWork.run(async (repositories) => {
      const forgotten = await repositories.messages.forgetMailbox(mailbox.id);
      await context.journal.expunged(repositories.pendingWork, forgotten, mailbox.role);
      return forgotten;
    });
    await this.deps.syncStates.delete(mailbox.id);
    await this.deps.rescans.forget(mailbox.accountId, mailbox.id);
    return threadIds;
  }
}
