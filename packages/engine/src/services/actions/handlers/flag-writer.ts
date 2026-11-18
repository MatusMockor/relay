import type { Message, ThreadSummary } from '@relay/shared/domain';
import type { Clock } from '../../../ports/clock';
import type { Repositories } from '../../../ports/repositories';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { type PendingProviderOp, recordProviderOps } from '../../shared/provider-ops';
import { refreshThread } from '../../shared/thread-refresh';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { requireUpserted } from './require-upserted';

export type WritableFlag = 'seen' | 'flagged';

export interface FlagWriterDeps {
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
  readonly clock: Clock;
}

export interface StagedFlagWrite {
  readonly thread: ThreadSummary;
  readonly ops: PendingProviderOp[];
}

export class FlagWriter {
  constructor(private readonly deps: FlagWriterDeps) {}

  async write(
    context: ThreadActionContext,
    targets: readonly Message[],
    flag: WritableFlag,
    value: boolean,
  ): Promise<ThreadSummary> {
    const { thread, ops } = await this.deps.unitOfWork.run((repositories) =>
      this.stage(repositories, context, targets, flag, value),
    );
    await this.deps.mirror.apply(context.account, ops);
    return thread;
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
    return { thread: requireUpserted(outcome, context.thread.id), ops };
  }
}
