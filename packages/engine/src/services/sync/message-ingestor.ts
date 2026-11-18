import type { MailAccount, Mailbox, Message, Split, SplitId, UserId } from '@relay/shared/domain';
import type { JiraClassification } from '../../model/jira';
import type { ParsedMessage } from '../../model/parsed-message';
import type { RawMessage } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { JiraClassifier } from '../../ports/jira-classifier';
import type { MessageParser } from '../../ports/message-parser';
import type { MessageRepository } from '../../ports/message-repository';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { SplitMatcher } from '../../ports/split-matcher';
import type { ThreadResolver } from '../../ports/thread-resolver';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { errorMessage } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { acceptsJiraEvents } from './jira-event-roles';
import { flagsDiffer, sameMembers } from './message-diff';
import { buildMessage } from './message-builder';
import type { MessageLabelsResolver } from './message-labels-resolver';
import type { SyncJournal } from './sync-journal';

export interface IngestTarget {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly mailbox: Mailbox;
  readonly splits: readonly Split[];
  readonly journal: SyncJournal | null;
  readonly publish: boolean;
  readonly live: boolean;
  readonly holdCalendar: boolean;
}

export type IngestOutcome =
  | { readonly kind: 'skipped'; readonly reason: string }
  | { readonly kind: 'existing'; readonly message: Message; readonly changed: boolean }
  | {
      readonly kind: 'created';
      readonly message: Message;
      readonly parsed: ParsedMessage;
      readonly jira: JiraClassification | null;
      readonly splitIds: readonly SplitId[];
    };

export interface MessageIngestorDeps {
  readonly messages: MessageRepository;
  readonly unitOfWork: UnitOfWork;
  readonly parser: MessageParser;
  readonly threadResolver: ThreadResolver;
  readonly jiraClassifier: JiraClassifier;
  readonly splitMatcher: SplitMatcher;
  readonly labelsResolver: MessageLabelsResolver;
  readonly ids: IdGenerator;
  readonly calendarParts: CalendarPartsSink;
}

export class MessageIngestor {
  constructor(private readonly deps: MessageIngestorDeps) {}

  async ingest(target: IngestTarget, raw: RawMessage): Promise<IngestOutcome> {
    const location = { mailboxId: target.mailbox.id, uid: raw.uid };
    const known = await this.deps.messages.findByLocation(location);
    if (known !== null) {
      return this.refreshKnown(target, known, raw, false);
    }
    const parsed = await this.deps.parser.parse(raw.source).catch((error: unknown) => error);
    if (!isParsed(parsed)) {
      return { kind: 'skipped', reason: errorMessage(parsed) };
    }
    const pending = await this.findPending(target, parsed);
    if (pending !== null) {
      return this.refreshKnown(target, { ...pending, ...location }, raw, true);
    }
    return this.create(target, raw, parsed);
  }

  private async create(
    target: IngestTarget,
    raw: RawMessage,
    parsed: ParsedMessage,
  ): Promise<IngestOutcome> {
    const resolution = await this.deps.threadResolver.resolve(target.account.id, parsed);
    const jira = await this.deps.jiraClassifier.classify(parsed);
    const splitIds = await this.deps.splitMatcher.match({
      message: { from: parsed.from, subject: parsed.subject, headers: parsed.headers },
      jira,
      splits: target.splits,
    });
    const message = await this.deps.unitOfWork.run(async (repositories) => {
      const labelIds = await this.deps.labelsResolver.resolve(repositories, target.account.id, raw);
      const built = buildMessage(
        {
          accountId: target.account.id,
          threadId: resolution.threadId,
          mailbox: target.mailbox,
          raw,
          parsed,
          labelIds,
        },
        this.deps.ids,
      );
      const stored = await repositories.messages.upsert(built, parsed.headers);
      await this.journalArrival(repositories.pendingWork, target, stored, parsed, jira, splitIds);
      await this.deps.calendarParts.queue(repositories.pendingWork, {
        account: target.account,
        mailboxRole: target.mailbox.role,
        messageId: stored.id,
        threadId: stored.threadId,
        parts: parsed.calendarParts ?? [],
        publish: target.publish,
        hold: target.holdCalendar,
      });
      return stored;
    });
    return { kind: 'created', message, parsed, jira, splitIds };
  }

  private async journalArrival(
    work: PendingWorkRepository,
    target: IngestTarget,
    message: Message,
    parsed: ParsedMessage,
    jira: JiraClassification | null,
    splitIds: readonly SplitId[],
  ): Promise<void> {
    const { journal } = target;
    if (journal === null) {
      return;
    }
    await journal.arrived(work, message, target.mailbox.role, splitIds, {
      publish: target.publish,
      live: target.live,
      headers: parsed.headers,
      jira,
    });
    if (jira !== null && acceptsJiraEvents(target.mailbox.role)) {
      await journal.jira(work, message.id, {
        threadId: message.threadId,
        classification: jira,
        title: parsed.subject,
        from: parsed.from,
        headers: [...parsed.headers.entries()],
      });
    }
  }

  private async refreshKnown(
    target: IngestTarget,
    known: Message,
    raw: RawMessage,
    relocated: boolean,
  ): Promise<IngestOutcome> {
    return this.deps.unitOfWork.run(async (repositories) => {
      if (relocated) {
        await repositories.messages.move(known.id, { mailboxId: known.mailboxId, uid: known.uid });
      }
      await target.journal?.touched(repositories.pendingWork, known.threadId);
      const labelIds = await this.deps.labelsResolver.resolve(repositories, target.account.id, raw);
      const flagsChanged = flagsDiffer(known.flags, raw.flags);
      const labelsChanged = !sameMembers(known.labelIds, labelIds);
      if (flagsChanged) {
        await repositories.messages.updateFlags(known.id, { ...raw.flags });
      }
      if (labelsChanged) {
        await repositories.messages.updateLabels(known.id, labelIds);
      }
      const message: Message = { ...known, flags: { ...raw.flags }, labelIds };
      return { kind: 'existing', message, changed: flagsChanged || labelsChanged };
    });
  }

  private async findPending(target: IngestTarget, parsed: ParsedMessage): Promise<Message | null> {
    if (parsed.messageIdHeader === null) {
      return null;
    }
    const candidates = await this.deps.messages.findByMessageIdHeaders(target.account.id, [
      parsed.messageIdHeader,
    ]);
    return (
      candidates.find(
        (candidate) => candidate.mailboxId === target.mailbox.id && candidate.uid === PENDING_UID,
      ) ?? null
    );
  }
}

const isParsed = (value: unknown): value is ParsedMessage =>
  typeof value === 'object' && value !== null && !(value instanceof Error) && 'headers' in value;
