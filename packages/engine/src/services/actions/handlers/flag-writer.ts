import type { Message, ThreadSummary } from '@relay/shared/domain';
import type { Clock } from '../../../ports/clock';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { recordProviderOps } from '../../shared/provider-ops';
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

export class FlagWriter {
  constructor(private readonly deps: FlagWriterDeps) {}

  async write(
    context: ThreadActionContext,
    targets: readonly Message[],
    flag: WritableFlag,
    value: boolean,
  ): Promise<ThreadSummary> {
    const { outcome, ops } = await this.deps.unitOfWork.run(async (repositories) => {
      for (const message of targets) {
        await repositories.messages.updateFlags(message.id, { ...message.flags, [flag]: value });
      }
      const recorded = await recordProviderOps(
        repositories.pendingWork,
        context.account.id,
        targets.map((message) => ({
          messageId: message.id,
          change: { kind: 'flag', flag, value } as const,
        })),
        this.deps.clock.now().toISOString(),
      );
      const refreshed = await refreshThread(
        repositories,
        context.userId,
        context.account.id,
        context.thread.id,
      );
      return { outcome: refreshed, ops: recorded };
    });
    await this.deps.mirror.apply(context.account, ops);
    return requireUpserted(outcome, context.thread.id);
  }
}
