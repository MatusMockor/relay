import type { Label, LabelId, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../../errors';
import type { LabelRepository } from '../../../ports/label-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { refreshThread } from '../../shared/thread-refresh';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { requireUpserted } from './require-upserted';

export interface LabelHandlerDeps {
  readonly labels: LabelRepository;
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
}

export class LabelHandler {
  constructor(private readonly deps: LabelHandlerDeps) {}

  async add(context: ThreadActionContext, labelId: LabelId): Promise<ThreadSummary> {
    const label = await this.requireLabel(context, labelId);
    return this.apply(context, label, true);
  }

  async remove(context: ThreadActionContext, labelId: LabelId): Promise<ThreadSummary> {
    const label = await this.requireLabel(context, labelId);
    return this.apply(context, label, false);
  }

  private async apply(
    context: ThreadActionContext,
    label: Label,
    add: boolean,
  ): Promise<ThreadSummary> {
    const targets = context.messages.filter(
      (message) => message.labelIds.includes(label.id) !== add,
    );
    const outcome = await this.deps.unitOfWork.run(async (repositories) => {
      for (const message of targets) {
        const labelIds = add
          ? [...message.labelIds, label.id]
          : message.labelIds.filter((id) => id !== label.id);
        await repositories.messages.updateLabels(message.id, labelIds);
      }
      return refreshThread(repositories, context.userId, context.account.id, context.thread.id);
    });
    await this.deps.mirror.apply(context.account, targets, (provider, batch) =>
      provider.setKeywords(batch.mailbox.path, batch.uids, {
        add: add ? [label.name] : [],
        remove: add ? [] : [label.name],
      }),
    );
    return requireUpserted(outcome, context.thread.id);
  }

  private async requireLabel(context: ThreadActionContext, labelId: LabelId): Promise<Label> {
    const label = await this.deps.labels.findById(context.userId, labelId);
    if (label === null) {
      throw new NotFoundError('Label', labelId);
    }
    if (label.accountId !== context.account.id) {
      throw new ValidationError('Label belongs to a different account than the thread');
    }
    return label;
  }
}
