import type { Label, LabelId, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../../errors';
import type { Clock } from '../../../ports/clock';
import type { LabelRepository } from '../../../ports/label-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import { refreshThread } from '../../shared/thread-refresh';
import type { ProviderMirror } from '../provider-mirror';
import type { ThreadActionContext } from '../thread-action-context';
import { labelTargets } from './action-targets';
import { gmailWrite, keywordWrite, type LabelWrite } from './label-writes';
import type { MessageLocator } from './message-locator';
import { requireUpserted } from './require-upserted';

export interface LabelHandlerDeps {
  readonly labels: LabelRepository;
  readonly locator: MessageLocator;
  readonly unitOfWork: UnitOfWork;
  readonly mirror: ProviderMirror;
  readonly clock: Clock;
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
    const write = await this.writeOf(context, label, add);
    const now = this.deps.clock.now().toISOString();
    const { outcome, ops } = await this.deps.unitOfWork.run(async (repositories) => {
      const recorded = await write(repositories, context.account.id, now);
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

  private writeOf(context: ThreadActionContext, label: Label, add: boolean): Promise<LabelWrite> {
    const targets = labelTargets(context.messages, label.id, add);
    if (label.kind === 'gmail') {
      return gmailWrite(this.deps.locator, context, label, add, targets);
    }
    return Promise.resolve(keywordWrite(label, add, targets));
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
