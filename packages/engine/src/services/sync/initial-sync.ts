import type { MailboxId } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { Logger } from '../../ports/logger';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { completedSyncState } from './completed-sync-state';
import { conversationOrder, orderEntries } from './conversation-order';
import { entryKey, fetchChunk } from './initial-chunk';
import { isHeldRole } from './held-roles';
import { InitialProgress } from './initial-progress';
import {
  type InitialWindowDeps,
  type MailboxWindow,
  mailboxWindow,
  type WindowEntry,
} from './initial-window';
import { mailboxOrder } from './mailbox-order';
import type { MailboxPass } from './mailbox-synchronizer';
import type { MessageFetchSteps, SyncMark } from './message-fetch-steps';
import type { SyncContext } from './sync-context';
import type { TrashRelatives } from './trash-relatives';
import { skipOnUidValidityChange } from './uid-validity-guard';

export interface SyncRound {
  readonly passes: readonly MailboxPass[];
  readonly skipped: boolean;
}

export interface InitialSyncDeps extends InitialWindowDeps {
  readonly steps: MessageFetchSteps;
  readonly relatives: TrashRelatives;
  readonly syncStates: SyncStateRepository;
  readonly calendarParts: CalendarPartsSink;
  readonly logger: Logger;
}

const BACKLOG = { publish: false, live: false, holdCalendar: true } as const;

const chunked = <Item>(items: readonly Item[], size: number): Item[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

const mark = (window: MailboxWindow, initialWindow: InitialSyncWindow | null): SyncMark => {
  const { state, status } = window.pass;
  return {
    lastUid: window.topUid,
    highestModseq: state === null ? status.highestModseq : state.highestModseq,
    initialWindow,
  };
};

const allFetched = (
  entries: ReadonlySet<WindowEntry>,
  fetched: ReadonlyMap<string, RawMessage>,
): boolean =>
  [...entries].every((entry) => fetched.has(entryKey(entry.pass.mailbox.id, entry.uid)));

const deferHeld = (chunk: readonly WindowEntry[], failed: Set<MailboxId>): void => {
  chunk
    .filter((entry) => isHeldRole(entry.pass.role))
    .forEach((entry) => failed.add(entry.pass.mailbox.id));
};

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
    const windows = await this.windows(context, passes);
    for (const window of windows) {
      await steps.save(context, window.pass, mark(window, window.frozen));
    }
    const progress = new InitialProgress(windows);
    const failed = await this.ingest(context, windows, progress, round.passes);
    await steps.flush(context);
    const completed = progress.all().filter(({ window }) => !failed.has(window.pass.mailbox.id));
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

  private async windows(
    context: SyncContext,
    passes: readonly MailboxPass[],
  ): Promise<MailboxWindow[]> {
    const windows: MailboxWindow[] = [];
    for (const pass of passes) {
      const window = await skipOnUidValidityChange(this.deps.logger, context, pass.mailbox, () =>
        mailboxWindow(context, pass, this.deps),
      );
      if (window !== null) {
        windows.push(window);
      }
    }
    return windows;
  }

  private async ingest(
    context: SyncContext,
    windows: readonly MailboxWindow[],
    progress: InitialProgress,
    passes: readonly MailboxPass[],
  ): Promise<Set<MailboxId>> {
    const { steps, relatives, options, logger } = this.deps;
    const failed = new Set<MailboxId>();
    const wanted = conversationOrder(windows).filter((entry) => entry.wanted);
    for (const chunk of chunked(wanted, options.batchSize)) {
      const found = await relatives.find(context, chunk, passes);
      const related = new Set(found.entries);
      const ordered = related.size === 0 ? chunk : orderEntries([chunk, [...related]]);
      const fetched = await fetchChunk(context, logger, ordered, failed);
      if (!found.complete || !allFetched(related, fetched)) {
        deferHeld(chunk, failed);
      }
      for (const entry of ordered) {
        const mailboxId = entry.pass.mailbox.id;
        const raw = fetched.get(entryKey(mailboxId, entry.uid));
        if (raw !== undefined && !failed.has(mailboxId)) {
          await steps.ingest(context, entry.pass, raw, BACKLOG);
        }
        if (!failed.has(mailboxId) && !related.has(entry)) {
          progress.advance(mailboxId);
        }
      }
      await steps.flush(context);
      for (const { window, processed } of progress.takeTouched()) {
        await steps.progress(context, window.pass, processed, window.total);
      }
    }
    return failed;
  }
}
