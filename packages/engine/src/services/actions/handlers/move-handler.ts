import type { Mailbox, MailboxId, MailboxRole, ThreadSummary } from '@relay/shared/domain';
import { NotFoundError, ValidationError } from '../../../errors';
import type { Clock } from '../../../ports/clock';
import type { LabelRepository } from '../../../ports/label-repository';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import { expireMoveOrigins } from '../../shared/move-origins';
import type { ThreadActionContext } from '../thread-action-context';
import { folderMove } from './folder-move-plans';
import { gmailMove } from './gmail-move-plans';
import type { StateMovePlanner } from './state-move-plan';
import type { StateMoveHandler } from './state-move-handler';
import { undoMove } from './undo-move-plans';

export interface MoveHandlerDeps {
  readonly mailboxes: MailboxRepository;
  readonly labels: LabelRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly stateMoves: StateMoveHandler;
  readonly clock: Clock;
}

const MOVE_TARGET_ROLES: readonly MailboxRole[] = ['inbox', 'archive', 'custom', 'label'];
const UNDO_WINDOW_MS = 60 * 60_000;

export class MoveHandler {
  constructor(private readonly deps: MoveHandlerDeps) {}

  async move(context: ThreadActionContext, mailboxId: MailboxId): Promise<ThreadSummary> {
    const target = await this.target(context, mailboxId);
    const planner = await this.planner(context, target);
    await this.expireUndoRecords(context);
    return this.deps.stateMoves.execute(context, planner);
  }

  async undo(context: ThreadActionContext): Promise<ThreadSummary> {
    await this.expireUndoRecords(context);
    return this.deps.stateMoves.execute(context, undoMove);
  }

  private async expireUndoRecords(context: ThreadActionContext): Promise<void> {
    const before = new Date(this.deps.clock.now().getTime() - UNDO_WINDOW_MS).toISOString();
    await expireMoveOrigins(this.deps.pendingWork, context.account.id, 'move-origin', before);
  }

  private async target(context: ThreadActionContext, mailboxId: MailboxId): Promise<Mailbox> {
    const mailbox = await this.deps.mailboxes.findById(mailboxId);
    if (mailbox === null || mailbox.accountId !== context.account.id) {
      throw new NotFoundError('Mailbox', mailboxId);
    }
    if (!MOVE_TARGET_ROLES.includes(mailbox.role)) {
      throw new ValidationError('Do tohto priečinka sa konverzácie presúvať nedajú.');
    }
    return mailbox;
  }

  private async planner(context: ThreadActionContext, target: Mailbox): Promise<StateMovePlanner> {
    if (target.role !== 'label') {
      return folderMove({ role: target.role, mailboxId: target.id });
    }
    const label = await this.deps.labels.findByRemoteName(context.account.id, 'gmail', target.path);
    if (label === null) {
      throw new ValidationError('Štítok sa ešte nesynchronizoval, skús to o chvíľu.');
    }
    return gmailMove(label.id);
  }
}
