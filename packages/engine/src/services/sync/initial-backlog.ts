import type { MailboxId } from '@relay/shared/domain';
import type { RawMessage } from '../../model/remote-mail';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { Logger } from '../../ports/logger';
import { chunked } from '../shared/chunked';
import { conversationGroups, conversationOrder, orderEntries } from './conversation-order';
import { firstBatch } from './first-batch';
import { isHeldRole } from './held-roles';
import type { InboxAncestors } from './inbox-ancestors';
import { entryKey, fetchChunk } from './initial-chunk';
import type { InitialProgress } from './initial-progress';
import type { MailboxWindow, WindowEntry } from './initial-window';
import type { MailboxPass } from './mailbox-synchronizer';
import type { MessageFetchSteps } from './message-fetch-steps';
import type { SyncContext } from './sync-context';
import type { SyncOptions } from './sync-options';
import type { TrashRelatives } from './trash-relatives';

export interface InitialBacklogDeps {
  readonly steps: MessageFetchSteps;
  readonly relatives: TrashRelatives;
  readonly ancestors: InboxAncestors;
  readonly logger: Logger;
  readonly options: SyncOptions;
}

export interface BacklogRun {
  readonly context: SyncContext;
  readonly passes: readonly MailboxPass[];
  readonly progress: InitialProgress;
  readonly failed: Set<MailboxId>;
}

const BACKLOG = { publish: false, live: false, holdCalendar: true } as const;

const keyOf = (entry: WindowEntry): string => entryKey(entry.pass.mailbox.id, entry.uid);

const inInbox = (entry: WindowEntry): boolean => entry.pass.role === 'inbox';

const allFetched = (
  entries: readonly WindowEntry[],
  fetched: ReadonlyMap<string, RawMessage>,
): boolean => entries.every((entry) => fetched.has(keyOf(entry)));

const deferHeld = (chunk: readonly WindowEntry[], failed: Set<MailboxId>): void => {
  chunk
    .filter((entry) => isHeldRole(entry.pass.role))
    .forEach((entry) => failed.add(entry.pass.mailbox.id));
};

export class InitialBacklog {
  constructor(private readonly deps: InitialBacklogDeps) {}

  async head(run: BacklogRun, windows: readonly MailboxWindow[]): Promise<ReadonlySet<string>> {
    const { firstBatchSize, firstPageConversations, batchSize } = this.deps.options;
    const wanted = conversationGroups(windows).map((group) =>
      group.filter((entry) => entry.wanted),
    );
    const head = firstBatch(wanted, {
      messages: Math.min(firstBatchSize, batchSize),
      conversations: Number.POSITIVE_INFINITY,
    });
    const page = firstBatch(wanted, { messages: batchSize, conversations: firstPageConversations });
    const frozen = windows[0]?.frozen;
    if (head.length === 0 || frozen === undefined) {
      return new Set();
    }
    const parts = [head, page.slice(head.length)].filter((part) => part.length > 0);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const { steps } = this.deps;
    await steps.stage(run.context, 'inbox', 0, total);
    const done: WindowEntry[] = [];
    for (const part of parts) {
      if (!(await this.part(run, part, frozen))) {
        return new Set(done.map(keyOf));
      }
      done.push(...part);
      const fetched = done.filter((entry) => !run.failed.has(entry.pass.mailbox.id));
      await steps.stage(run.context, 'inbox', fetched.length, total);
    }
    return new Set(done.map(keyOf));
  }

  private async part(
    run: BacklogRun,
    head: readonly WindowEntry[],
    frozen: InitialSyncWindow,
  ): Promise<boolean> {
    const ancestors = await this.deps.ancestors.find(run.context, head, run.passes, frozen);
    if (ancestors === null) {
      return false;
    }
    await this.chunk(run, head, ancestors);
    return true;
  }

  async rest(
    run: BacklogRun,
    windows: readonly MailboxWindow[],
    done: ReadonlySet<string>,
  ): Promise<void> {
    const wanted = conversationOrder(windows, inInbox).filter(
      (entry) => entry.wanted && !done.has(keyOf(entry)),
    );
    await this.backlogProgress(run);
    for (const chunk of chunked(wanted, this.deps.options.batchSize)) {
      await this.chunk(run, chunk, []);
      await this.backlogProgress(run);
    }
  }

  private backlogProgress(run: BacklogRun): Promise<void> {
    const { processed, total } = run.progress.totals();
    return this.deps.steps.stage(run.context, 'backlog', processed, total);
  }

  private async chunk(
    run: BacklogRun,
    chunk: readonly WindowEntry[],
    ancestors: readonly WindowEntry[],
  ): Promise<void> {
    const { steps, relatives, logger } = this.deps;
    const { context, progress, failed } = run;
    const base = [...chunk, ...ancestors];
    const found = await relatives.find(context, base, run.passes);
    const uncounted = new Set([...ancestors, ...found.entries]);
    const ordered = uncounted.size === 0 ? chunk : orderEntries([chunk, ancestors, found.entries]);
    const fetched = await fetchChunk(context, logger, ordered, failed);
    if (!found.complete || !allFetched(found.entries, fetched)) {
      deferHeld(base, failed);
    }
    for (const entry of ordered) {
      const mailboxId = entry.pass.mailbox.id;
      const raw = fetched.get(keyOf(entry));
      if (raw !== undefined && !failed.has(mailboxId)) {
        await steps.ingest(context, entry.pass, raw, BACKLOG);
      }
      if (!failed.has(mailboxId) && !uncounted.has(entry)) {
        progress.advance(mailboxId);
      }
    }
    await steps.flush(context);
    for (const { window, processed } of progress.takeTouched()) {
      await steps.progress(context, window.pass, processed, window.total);
    }
  }
}
