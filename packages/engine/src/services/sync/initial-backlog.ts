import type { MailboxId } from '@relay/shared/domain';
import type { RawMessage, RemoteMessageMeta } from '../../model/remote-mail';
import type { InitialSyncWindow } from '../../model/sync-state';
import type { Logger } from '../../ports/logger';
import { chunked } from '../shared/chunked';
import { labelsMessages } from '../shared/mail-copies';
import type { BacklogPhase } from './backlog-phase';
import { type BacklogPlan, keyOf, planBacklog } from './backlog-plan';
import { conversationGroups, orderEntries } from './conversation-order';
import { firstBatch } from './first-batch';
import { freshMeta } from './fresh-meta';
import { isHeldRole } from './held-roles';
import type { InboxAncestors } from './inbox-ancestors';
import { fetchChunk } from './initial-chunk';
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
  readonly missedAncestors: Map<MailboxId, Set<string>>;
  readonly settled: Set<string>;
}

const BACKLOG = { publish: false, live: false, holdCalendar: true } as const;

const allResolved = (
  entries: readonly WindowEntry[],
  fetched: ReadonlyMap<string, RawMessage>,
  attached: ReadonlySet<string>,
): boolean => entries.every((entry) => fetched.has(keyOf(entry)) || attached.has(keyOf(entry)));

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
    const ancestors = await this.deps.ancestors.find(
      run.context,
      head,
      run.passes,
      frozen,
      run.missedAncestors,
    );
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
    phase: BacklogPhase,
  ): Promise<ReadonlySet<string>> {
    const plan = planBacklog(windows, done, phase);
    if (plan.wanted.length === 0 && !phase.emitWhenEmpty) {
      return plan.processed;
    }
    let carriedDone = 0;
    await this.phaseProgress(run, phase, plan, carriedDone);
    for (const chunk of chunked(plan.wanted, this.deps.options.batchSize)) {
      await this.chunk(run, this.unsettled(run, chunk), []);
      carriedDone += chunk.filter((entry) => plan.carried.has(entry)).length;
      await this.phaseProgress(run, phase, plan, carriedDone);
    }
    return plan.processed;
  }

  private unsettled(run: BacklogRun, chunk: readonly WindowEntry[]): WindowEntry[] {
    const settled = chunk.filter((entry) => run.settled.has(keyOf(entry)));
    settled.forEach((entry) => {
      run.progress.advance(entry.pass.mailbox.id);
    });
    return chunk.filter((entry) => !run.settled.has(keyOf(entry)));
  }

  private phaseProgress(
    run: BacklogRun,
    phase: BacklogPhase,
    plan: BacklogPlan,
    carriedDone: number,
  ): Promise<void> {
    const { processed, total } = run.progress.totals(phase.counted);
    const extra = plan.carried.size - plan.held;
    return this.deps.steps.stage(run.context, phase.stage, processed + carriedDone, total + extra);
  }

  private async attachHeld(
    context: SyncContext,
    entries: readonly WindowEntry[],
    metas: ReadonlyMap<string, RemoteMessageMeta>,
    attached: Set<string>,
    failed: Set<MailboxId>,
  ): Promise<Map<string, RawMessage>> {
    const { steps, logger } = this.deps;
    const unattached: WindowEntry[] = [];
    for (const entry of entries) {
      if (failed.has(entry.pass.mailbox.id)) {
        continue;
      }
      const meta = metas.get(keyOf(entry));
      if (meta !== undefined && (await steps.tryAttachMeta(context, entry.pass, meta, BACKLOG))) {
        attached.add(keyOf(entry));
        continue;
      }
      unattached.push(entry);
    }
    return unattached.length === 0
      ? new Map<string, RawMessage>()
      : fetchChunk(context, logger, unattached, failed);
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
    const attached = new Set<string>();
    const pending: WindowEntry[] = [];
    const heldPending: WindowEntry[] = [];
    const deferredAttach = new Set<string>();
    const pendingEmailIds = new Set<string>();
    const relativeKeys = new Set(found.entries.map(keyOf));
    const labelBased = labelsMessages(context.account);
    const metas = labelBased
      ? await freshMeta(context, logger, ordered, failed, (entry, meta) =>
          steps.canAttachMeta(context, entry.pass, meta, BACKLOG),
        )
      : new Map<string, RemoteMessageMeta>();
    for (const entry of ordered) {
      const mailboxId = entry.pass.mailbox.id;
      const key = keyOf(entry);
      const held = isHeldRole(entry.pass.role);
      const meta = metas.get(key);
      if (
        !held &&
        !failed.has(mailboxId) &&
        meta !== undefined &&
        (await steps.tryAttachMeta(context, entry.pass, meta, BACKLOG))
      ) {
        attached.add(key);
        continue;
      }
      const emailId = entry.meta?.emailId ?? null;
      if (
        labelBased &&
        emailId !== null &&
        entry.pass.role !== 'inbox' &&
        !relativeKeys.has(key) &&
        pendingEmailIds.has(emailId)
      ) {
        deferredAttach.add(key);
        continue;
      }
      if (labelBased && emailId !== null) {
        pendingEmailIds.add(emailId);
      }
      (held ? heldPending : pending).push(entry);
    }
    const fetched =
      pending.length === 0
        ? new Map<string, RawMessage>()
        : await fetchChunk(context, logger, pending, failed);
    if (!found.complete || !allResolved(found.entries, fetched, attached)) {
      deferHeld(base, failed);
    }
    const heldFetched = await this.attachHeld(context, heldPending, metas, attached, failed);
    heldFetched.forEach((raw, key) => fetched.set(key, raw));
    const fallback: WindowEntry[] = [];
    for (const entry of ordered) {
      const mailboxId = entry.pass.mailbox.id;
      const key = keyOf(entry);
      if (attached.has(key)) {
        if (!failed.has(mailboxId) && !uncounted.has(entry)) {
          progress.advance(mailboxId);
        }
        continue;
      }
      if (deferredAttach.has(key)) {
        const meta = metas.get(key);
        if (
          !failed.has(mailboxId) &&
          meta !== undefined &&
          (await steps.tryAttachMeta(context, entry.pass, meta, BACKLOG))
        ) {
          attached.add(key);
          if (!uncounted.has(entry)) {
            progress.advance(mailboxId);
          }
          continue;
        }
        fallback.push(entry);
        continue;
      }
      const raw = fetched.get(key);
      if (raw !== undefined && !failed.has(mailboxId)) {
        await steps.ingest(context, entry.pass, raw, BACKLOG);
      }
      if (!failed.has(mailboxId) && !uncounted.has(entry)) {
        progress.advance(mailboxId);
      }
    }
    if (fallback.length > 0) {
      const extra = await fetchChunk(context, logger, fallback, failed);
      extra.forEach((raw, key) => fetched.set(key, raw));
      for (const entry of fallback) {
        const mailboxId = entry.pass.mailbox.id;
        const raw = extra.get(keyOf(entry));
        if (raw !== undefined && !failed.has(mailboxId)) {
          await steps.ingest(context, entry.pass, raw, BACKLOG);
        }
        if (!failed.has(mailboxId) && !uncounted.has(entry)) {
          progress.advance(mailboxId);
        }
      }
    }
    found.entries
      .filter((entry) => !failed.has(entry.pass.mailbox.id))
      .filter((entry) => attached.has(keyOf(entry)) || fetched.has(keyOf(entry)))
      .forEach((entry) => run.settled.add(keyOf(entry)));
    await steps.flush(context);
    for (const { window, processed } of progress.takeTouched()) {
      await steps.progress(context, window.pass, processed, window.total);
    }
  }
}
