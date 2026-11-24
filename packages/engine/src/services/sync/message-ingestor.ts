import type { Message, MessageBodyState } from '@relay/shared/domain';
import type { ParsedMessage } from '../../model/parsed-message';
import type { RawMessage, RemoteMessageMeta, RemoteMessageSummary } from '../../model/remote-mail';
import type { IdGenerator } from '../../ports/id-generator';
import type { JiraClassifier } from '../../ports/jira-classifier';
import type { MessageParser } from '../../ports/message-parser';
import type { MessageRepository } from '../../ports/message-repository';
import type { SplitMatcher } from '../../ports/split-matcher';
import type { ThreadResolver } from '../../ports/thread-resolver';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { hasFileAttachments } from '../../subjects/match-subject';
import { errorMessage } from '../shared/mail-provider-sessions';
import { PENDING_UID } from '../shared/pending-uid';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { summaryMessage } from './history/summary-message';
import { recordCreated } from './ingest-effects';
import type { IngestOutcome, IngestTarget } from './ingest-target';
import { flagsDiffer, sameMembers } from './message-diff';
import { buildMessage } from './message-builder';
import type { MessageLabelsResolver } from './message-labels-resolver';
import { syncedFlags } from './synced-flags';

export type { IngestOutcome, IngestTarget } from './ingest-target';

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

type Parse = () => Promise<ParsedMessage>;

export class MessageIngestor {
  constructor(private readonly deps: MessageIngestorDeps) {}

  ingest(target: IngestTarget, raw: RawMessage): Promise<IngestOutcome> {
    return this.ingestRemote(target, raw, () => this.deps.parser.parse(raw.source), 'local');
  }

  ingestSummary(target: IngestTarget, summary: RemoteMessageSummary): Promise<IngestOutcome> {
    return this.ingestRemote(
      { ...target, history: true },
      summary,
      () => summaryMessage(this.deps.parser, summary),
      'remote',
    );
  }

  private async ingestRemote(
    target: IngestTarget,
    remote: RemoteMessageMeta,
    parse: Parse,
    bodyState: MessageBodyState,
  ): Promise<IngestOutcome> {
    const location = { mailboxId: target.mailbox.id, uid: remote.uid };
    const known = await this.deps.messages.findByLocation(location);
    if (known !== null) {
      return this.refreshKnown(target, known, remote, false);
    }
    const parsed = await parse().catch((error: unknown) => error);
    if (!isParsed(parsed)) {
      return { kind: 'skipped', reason: errorMessage(parsed) };
    }
    const pending = await this.findPending(target, parsed);
    if (pending !== null) {
      return this.refreshKnown(target, { ...pending, ...location }, remote, true);
    }
    return this.create(target, remote, parsed, bodyState);
  }

  private async create(
    target: IngestTarget,
    remote: RemoteMessageMeta,
    parsed: ParsedMessage,
    bodyState: MessageBodyState,
  ): Promise<IngestOutcome> {
    const resolution = await this.deps.threadResolver.resolve(target.account.id, parsed);
    const jira = await this.deps.jiraClassifier.classify(parsed);
    const splitIds = await this.deps.splitMatcher.match({
      message: {
        from: parsed.from,
        subject: parsed.subject,
        headers: parsed.headers,
        to: parsed.to,
        cc: parsed.cc,
        hasAttachments: hasFileAttachments(parsed.attachments),
      },
      jira,
      splits: target.splits,
    });
    const message = await this.deps.unitOfWork.run(async (repositories) => {
      const labelIds = await this.deps.labelsResolver.resolve(
        repositories,
        target.account.id,
        remote,
      );
      const built = buildMessage(
        {
          accountId: target.account.id,
          threadId: resolution.threadId,
          mailbox: target.mailbox,
          raw: remote,
          parsed,
          labelIds,
          bodyState,
        },
        this.deps.ids,
      );
      const stored = await repositories.messages.upsert(built, parsed.headers);
      await recordCreated(repositories.pendingWork, this.deps.calendarParts, target, {
        message: stored,
        parsed,
        jira,
        splitIds,
      });
      return stored;
    });
    return { kind: 'created', message, parsed, jira, splitIds };
  }

  private async refreshKnown(
    target: IngestTarget,
    known: Message,
    remote: RemoteMessageMeta,
    relocated: boolean,
  ): Promise<IngestOutcome> {
    return this.deps.unitOfWork.run(async (repositories) => {
      if (relocated) {
        await repositories.messages.move(known.id, { mailboxId: known.mailboxId, uid: known.uid });
      }
      await target.journal?.touched(repositories.pendingWork, known.threadId);
      const labelIds = await this.deps.labelsResolver.resolve(
        repositories,
        target.account.id,
        remote,
      );
      const flags = await syncedFlags(repositories.pendingWork, known, remote.flags);
      const flagsChanged = flagsDiffer(known.flags, flags);
      const labelsChanged = !sameMembers(known.labelIds, labelIds);
      if (flagsChanged) {
        await repositories.messages.updateFlags(known.id, flags);
      }
      if (labelsChanged) {
        await repositories.messages.updateLabels(known.id, labelIds);
      }
      const message: Message = { ...known, flags, labelIds };
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
