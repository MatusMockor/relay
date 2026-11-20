import type {
  Label,
  Mailbox,
  MailboxId,
  Message,
  ThreadAction,
  ThreadId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared';
import { MailClientError } from '../errors';
import { projectThreadAction } from '../thread-projection';
import { applyReadFlags } from './demo-read-flags';
import type { DemoState, DemoThreadRecord } from './demo-state';

interface DemoMoveOrigin {
  readonly sequence: number;
  readonly messages: readonly Message[];
  readonly state: ThreadState;
  readonly markedDone?: boolean;
  readonly remindAt: string | null;
  readonly labelIds: ThreadSummary['labelIds'];
}

const restorePlacement = (message: Message, origin: DemoMoveOrigin): Message => {
  const before = origin.messages.find((candidate) => candidate.id === message.id);
  if (before === undefined) {
    return message;
  }
  return { ...message, mailboxId: before.mailboxId, labelIds: before.labelIds };
};

const missingFolder = () =>
  new MailClientError({ code: 'not_found', message: 'Priečinok neexistuje' });

export class DemoMoves {
  private readonly origins = new Map<ThreadId, DemoMoveOrigin>();
  private readonly claims = new Map<string, number>();
  private sequence = 0;

  constructor(private readonly state: DemoState) {}

  claimOrigin(claim: string, threadId: ThreadId): void {
    const origin = this.origins.get(threadId);
    if (origin !== undefined) {
      this.claims.set(claim, origin.sequence);
    }
  }

  ownsOrigin(claim: string, threadId: ThreadId): boolean {
    const sequence = this.claims.get(claim);
    return sequence !== undefined && this.origins.get(threadId)?.sequence === sequence;
  }

  apply(record: DemoThreadRecord, action: ThreadAction): ThreadSummary {
    if (action.type === 'move') {
      return this.move(record, action.mailboxId);
    }
    if (action.type === 'undoMove') {
      return this.undo(record);
    }
    record.messages = applyReadFlags(record.messages, action);
    record.summary = projectThreadAction(record.summary, action);
    return record.summary;
  }

  private move(record: DemoThreadRecord, mailboxId: MailboxId): ThreadSummary {
    const { summary } = record;
    const target = this.mailboxOf(summary, (mailbox) => mailbox.id === mailboxId);
    const physical =
      target.role === 'label'
        ? this.mailboxOf(summary, (mailbox) => mailbox.role === 'archive')
        : target;
    const label = target.role === 'label' ? this.gmailLabel(summary, target.path) : undefined;
    this.sequence += 1;
    this.origins.set(summary.id, {
      sequence: this.sequence,
      messages: record.messages,
      state: summary.state,
      markedDone: summary.markedDone,
      remindAt: summary.remindAt,
      labelIds: summary.labelIds,
    });
    record.messages = record.messages.map((message) => ({
      ...message,
      mailboxId: physical.id,
      labelIds:
        label === undefined ? message.labelIds : [...new Set([...message.labelIds, label.id])],
    }));
    record.summary = projectThreadAction(
      summary,
      { type: 'move', mailboxId },
      { targetRole: target.role, labelId: label?.id },
    );
    return record.summary;
  }

  private undo(record: DemoThreadRecord): ThreadSummary {
    const origin = this.origins.get(record.summary.id);
    if (origin === undefined) {
      return record.summary;
    }
    this.origins.delete(record.summary.id);
    record.messages = record.messages.map((message) => restorePlacement(message, origin));
    record.summary = {
      ...record.summary,
      state: origin.state,
      markedDone: origin.state === 'inbox' ? false : origin.markedDone || record.summary.markedDone,
      remindAt: origin.remindAt,
      labelIds: origin.labelIds,
    };
    return record.summary;
  }

  private mailboxOf(summary: ThreadSummary, matches: (mailbox: Mailbox) => boolean): Mailbox {
    const found = this.state.mailboxes.find(
      (mailbox) => mailbox.accountId === summary.accountId && matches(mailbox),
    );
    if (found === undefined) {
      throw missingFolder();
    }
    return found;
  }

  private gmailLabel(summary: ThreadSummary, path: string): Label | undefined {
    return this.state.labels.find(
      (label) =>
        label.accountId === summary.accountId &&
        label.kind === 'gmail' &&
        label.remoteName === path,
    );
  }
}
