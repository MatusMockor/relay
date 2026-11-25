import type { MailboxId } from '@relay/shared/domain';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { Logger } from '../../ports/logger';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import { deferredPhase, primaryPhase, SINGLE_PHASE } from './backlog-phase';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { completedSyncState } from './completed-sync-state';
import type { BacklogRun, InitialBacklog } from './initial-backlog';
import { InitialProgress } from './initial-progress';
import { type InitialWindowDeps, type MailboxWindow, mailboxWindow } from './initial-window';
import { mailboxOrder } from './mailbox-order';
import type { MailboxPass } from './mailbox-synchronizer';
import type { MessageFetchSteps, SyncMark } from './message-fetch-steps';
import type { SyncContext } from './sync-context';
import { skipOnUidValidityChange } from './uid-validity-guard';

export interface SyncRound {
  readonly passes: readonly MailboxPass[];
  readonly skipped: boolean;
}

export interface InitialSyncDeps extends InitialWindowDeps {
  readonly steps: MessageFetchSteps;
  readonly backlog: InitialBacklog;
  readonly syncStates: SyncStateRepository;
  readonly calendarParts: CalendarPartsSink;
  readonly logger: Logger;
}

const mark = (window: MailboxWindow, initialWindow: InitialSyncWindow | null): SyncMark => {
  const { state, status } = window.pass;
  return {
    lastUid: window.topUid,
    highestModseq: state === null ? status.highestModseq : state.highestModseq,
    initialWindow,
  };
};

const isInbox = (pass: MailboxPass): boolean => pass.role === 'inbox';
const isPrimaryOther = (pass: MailboxPass): boolean =>
  pass.role === 'sent' || pass.role === 'archive';
const isDeferred = (pass: MailboxPass): boolean => !isInbox(pass) && !isPrimaryOther(pass);

export class InitialSync {
  constructor(private readonly deps: InitialSyncDeps) {}

  async holdsCalendar(context: SyncContext, passes: readonly MailboxPass[]): Promise<boolean> {
    if (passes.some((pass) => completedSyncState(pass.state) === null)) {
      return true;
    }
    return this.deps.calendarParts.hasHeld(context.account);
  }

  async run(context: SyncContext, round: SyncRound): Promise<void> {
    const { steps } = this.deps;
    const selected = new Set(round.passes.map((pass) => pass.mailbox.id));
    const passes = round.passes.filter((pass) => completedSyncState(pass.state) === null);
    if (passes.length === 0) {
      await this.releaseWhenSettled(context, round, selected);
      return;
    }
    const inboxPasses = passes.filter(isInbox);
    const primaryOtherPasses = passes.filter(isPrimaryOther);
    const deferredPasses = passes.filter(isDeferred);
    const primaryCount = inboxPasses.length + primaryOtherPasses.length;
    const headerCount = primaryCount > 0 ? primaryCount : deferredPasses.length;
    const progress = new InitialProgress(headerCount);
    const run: BacklogRun = {
      context,
      passes: round.passes,
      progress,
      failed: new Set(),
      missedAncestors: new Map(),
    };
    await steps.stage(context, 'headers', 0, headerCount);
    const inbox = await this.open(context, inboxPasses, progress, true);
    const head = await this.deps.backlog.head(run, inbox);
    const primary = [...inbox, ...(await this.open(context, primaryOtherPasses, progress, true))];
    const deferring = deferredPasses.length > 0;
    const done =
      primaryCount > 0
        ? await this.deps.backlog.rest(run, primary, head, primaryPhase(deferring))
        : head;
    if (deferring) {
      const deferred = await this.open(context, deferredPasses, progress, primaryCount === 0);
      const phase = primaryCount === 0 ? SINGLE_PHASE : deferredPhase(deferred);
      await this.deps.backlog.rest(run, [...primary, ...deferred], done, phase);
    }
    await steps.flush(context);
    const completed = progress
      .all()
      .filter(({ window }) => !run.failed.has(window.pass.mailbox.id));
    for (const { window, processed } of completed) {
      await steps.save(context, window.pass, mark(window, null));
      await steps.progress(context, window.pass, processed, Math.max(window.total, processed));
    }
    if (completed.length < passes.length) {
      return;
    }
    await this.releaseWhenSettled(context, round, selected);
    await steps.flush(context);
  }

  private async releaseWhenSettled(
    context: SyncContext,
    round: SyncRound,
    selected: ReadonlySet<MailboxId>,
  ): Promise<void> {
    if (round.skipped) {
      return;
    }
    const states = await this.deps.syncStates.listByAccount(context.account.id);
    const selectedStates = states.filter((state) => selected.has(state.mailboxId));
    if (selectedStates.some((state) => state.initialWindow !== null)) {
      return;
    }
    const order = mailboxOrder(context, this.deps.options.mailboxRoles);
    await this.deps.calendarParts.release(context.userId, context.account, order);
  }

  private async open(
    context: SyncContext,
    passes: readonly MailboxPass[],
    progress: InitialProgress,
    emitHeaders: boolean,
  ): Promise<MailboxWindow[]> {
    const windows: MailboxWindow[] = [];
    for (const pass of passes) {
      const window = await skipOnUidValidityChange(this.deps.logger, context, pass.mailbox, () =>
        mailboxWindow(context, pass, this.deps),
      );
      if (window !== null) {
        await this.deps.steps.save(context, pass, mark(window, window.frozen));
        windows.push(window);
      }
      if (emitHeaders) {
        await this.deps.steps.stage(context, 'headers', progress.opened(), progress.mailboxes);
      }
    }
    progress.add(windows);
    return windows;
  }
}
