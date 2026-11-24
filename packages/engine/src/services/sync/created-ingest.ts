import type { ParsedMessage } from '../../model/parsed-message';
import type { PlacementIdentity } from '../../model/placement-ingest';
import { hasFileAttachments } from '../../subjects/match-subject';
import { isPlacedOutcome, recordCreated } from './ingest-effects';
import type { FetchedMessage, IngestOutcome, IngestTarget } from './ingest-target';
import type { MessageIngestorDeps } from './ingestor-deps';
import { buildMessage } from './message-builder';
import { refreshPlaced } from './placed-refresh';
import { effectClaims } from './placement-effects';

export class CreatedIngest {
  constructor(private readonly deps: MessageIngestorDeps) {}

  async create(
    target: IngestTarget,
    fetched: FetchedMessage,
    identity: PlacementIdentity,
    parsed: ParsedMessage,
  ): Promise<IngestOutcome> {
    const { deps } = this;
    const resolution = await deps.threadResolver.resolve(target.account.id, parsed);
    const jira = await deps.jiraClassifier.classify(parsed);
    const splitIds = await deps.splitMatcher.match({
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
    const claims = effectClaims(target, true);
    const at = deps.clock.now().toISOString();
    return deps.unitOfWork.run(async (repositories) => {
      const labelIds = await deps.labelsResolver.resolve(
        repositories,
        target.account.id,
        fetched.remote,
      );
      const message = buildMessage(
        {
          accountId: target.account.id,
          threadId: resolution.threadId,
          mailbox: target.mailbox,
          raw: fetched.remote,
          parsed,
          labelIds,
          bodyState: fetched.bodyState,
        },
        deps.ids,
      );
      const outcome = await repositories.messages.place({
        ...identity,
        create: { message, headers: parsed.headers },
        claims,
        at,
      });
      if (isPlacedOutcome(outcome)) {
        return refreshPlaced(deps, repositories, target, fetched.remote, { outcome, parsed, jira });
      }
      if (outcome.kind === 'unmatched') {
        return { kind: 'skipped', reason: 'The message could not be placed' };
      }
      const created = { message: outcome.message, parsed, jira, splitIds };
      await recordCreated(repositories.pendingWork, deps.calendarParts, target, {
        ...created,
        claimed: outcome.claimed,
      });
      return { kind: 'created', ...created };
    });
  }
}
