import type { Message, ThreadSummary } from '@relay/shared/domain';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { byDateAscending } from '../../shared/dates';
import { refreshThread } from '../../shared/thread-refresh';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { requireUpserted } from './require-upserted';

export interface ReadStateHandlerDeps {
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
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
    const outcome = await this.deps.unitOfWork.run(async (repositories) => {
      for (const message of targets) {
        await repositories.messages.updateFlags(message.id, { ...message.flags, seen });
      }
      return refreshThread(repositories, context.userId, context.account.id, context.thread.id);
    });
    await this.deps.mirror.apply(context.account, targets, (provider, batch) =>
      provider.setFlags(batch.mailbox.path, batch.uids, {
        add: seen ? ['seen'] : [],
        remove: seen ? [] : ['seen'],
      }),
    );
    return requireUpserted(outcome, context.thread.id);
  }
}
