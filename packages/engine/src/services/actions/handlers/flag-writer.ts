import type { Message, ThreadSummary } from '@relay/shared/domain';
import type { Clock } from '../../../ports/clock';
import type { Repositories } from '../../../ports/repositories';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { type PendingProviderOp, recordProviderOps } from '../../shared/provider-ops';
import { refreshThread } from '../../shared/thread-refresh';
import type { MailboxEvents, MailboxEventScope } from '../../sync/mailbox-events';
import type { ProviderOpSink } from '../provider-op-sink';
import type { ThreadActionContext } from '../thread-action-context';
import { requireUpserted } from './require-upserted';
import { adjustUnreadCounts } from './unread-counts';

export type WritableFlag = 'seen' | 'flagged';

export interface FlagWriterDeps {
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderOpSink;
  readonly clock: Clock;
  readonly mailboxEvents: MailboxEvents;
}

export interface StagedFlagWrite {
  readonly thread: ThreadSummary;
  readonly ops: PendingProviderOp[];
  readonly countsChanged: boolean;
}

export class FlagWriter {
  constructor(private readonly deps: FlagWriterDeps) {}

  async write(
    context: ThreadActionContext,
    targets: readonly Message[],
    flag: WritableFlag,
    value: boolean,
  ): Promise<ThreadSummary> {
    const staged = await this.deps.unitOfWork.run((repositories) =>
      this.stage(repositories, context, targets, flag, value),
    );
    await (context.mirror ?? this.deps.mirror).apply(context.account, staged.ops);
    await this.publishCounts(context, [staged]);
    return staged.thread;
  }

  async stage(
    repositories: Repositories,
    context: ThreadActionContext,
    targets: readonly Message[],
    flag: WritableFlag,
    value: boolean,
  ): Promise<StagedFlagWrite> {
    for (const message of targets) {
      await repositories.messages.updateFlags(message.id, { ...message.flags, [flag]: value });
    }
    const countsChanged =
      flag === 'seen' && (await adjustUnreadCounts(repositories.mailboxes, targets, value));
    const ops = await recordProviderOps(
      repositories.pendingWork,
      context.account.id,
      targets.map((message) => ({
        messageId: message.id,
        change: { kind: 'flag', flag, value } as const,
      })),
      this.deps.clock.now().toISOString(),
    );
    const outcome = await refreshThread(
      repositories,
      context.userId,
      context.account.id,
      context.thread.id,
    );
    return { thread: requireUpserted(outcome, context.thread.id), ops, countsChanged };
  }

  async publishCounts(scope: MailboxEventScope, writes: readonly StagedFlagWrite[]): Promise<void> {
    if (!writes.some((write) => write.countsChanged)) {
      return;
    }
    await this.deps.mailboxEvents.mailboxesChanged(scope);
  }
}
