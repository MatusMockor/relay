import type { Message, ThreadSummary } from '@relay/shared/domain';
import type { Clock } from '../../../ports/clock';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { byDateAscending } from '../../shared/dates';
import { recordProviderOps } from '../../shared/provider-ops';
import { refreshThread } from '../../shared/thread-refresh';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { requireUpserted } from './require-upserted';

export interface ReadStateHandlerDeps {
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
  readonly clock: Clock;
}

export class ReadStateHandler {
  constructor(private readonly deps: ReadStateHandlerDeps) {}

  markRead(context: ThreadActionContext): Promise<ThreadSummary> {
    const targets = context.messages.filter((message) => !message.flags.seen);
    return this.apply(context, targets, true);
  }

  markUnread(context: ThreadActionContext): Promise<ThreadSummary> {
    const latest = [...context.messages].sort(byDateAscending).at(-1);
    const targets = latest === undefined || !latest.flags.seen ? [] : [latest];
    return this.apply(context, targets, false);
  }

  private async apply(
    context: ThreadActionContext,
    targets: readonly Message[],
    seen: boolean,
  ): Promise<ThreadSummary> {
    const { outcome, ops } = await this.deps.unitOfWork.run(async (repositories) => {
      for (const message of targets) {
        await repositories.messages.updateFlags(message.id, { ...message.flags, seen });
      }
      const recorded = await recordProviderOps(
        repositories.pendingWork,
        context.account.id,
        targets.map((message) => ({
          messageId: message.id,
          change: { kind: 'flag', flag: 'seen', value: seen } as const,
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
