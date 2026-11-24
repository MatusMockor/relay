import type { ParsedMessage } from '../../model/parsed-message';
import type { PlacementIdentity, PlacementMatch } from '../../model/placement-ingest';
import { isPlacedOutcome } from './ingest-effects';
import type { FetchedMessage, IngestOutcome, IngestTarget } from './ingest-target';
import type { MessageIngestorDeps } from './ingestor-deps';
import { refreshPlaced } from './placed-refresh';
import { effectClaims, needsParse } from './placement-effects';

const parsedOrNull = (fetched: FetchedMessage): Promise<ParsedMessage | null> =>
  fetched.parse().catch(() => null);

export class PlacedIngest {
  constructor(private readonly deps: MessageIngestorDeps) {}

  async apply(
    target: IngestTarget,
    fetched: FetchedMessage,
    identity: PlacementIdentity,
    match: PlacementMatch,
    known: ParsedMessage | null,
  ): Promise<IngestOutcome | null> {
    const { deps } = this;
    const parsed = known ?? (needsParse(target, match) ? await parsedOrNull(fetched) : null);
    const jira = parsed === null ? null : await deps.jiraClassifier.classify(parsed);
    const claims = effectClaims(target, parsed !== null);
    const at = deps.clock.now().toISOString();
    const outcome = await deps.unitOfWork.run(async (repositories) => {
      const placed = await repositories.messages.place({ ...identity, create: null, claims, at });
      if (!isPlacedOutcome(placed)) {
        return null;
      }
      return refreshPlaced(deps, repositories, target, fetched.remote, {
        outcome: placed,
        parsed,
        jira,
      });
    });
    if (outcome?.kind === 'existing') {
      await deps.bodyFill?.fill(outcome.message, fetched.source);
    }
    return outcome;
  }
}
