import type { ParsedMessage } from '../../model/parsed-message';
import type { RawMessage, RemoteMessageSummary } from '../../model/remote-mail';
import { errorMessage } from '../shared/mail-provider-sessions';
import { CreatedIngest } from './created-ingest';
import { summaryMessage } from './history/summary-message';
import type { FetchedMessage, IngestOutcome, IngestTarget } from './ingest-target';
import type { MessageIngestorDeps } from './ingestor-deps';
import { PlacedIngest } from './placed-ingest';
import { identityOf } from './placement-identity';

export type { IngestOutcome, IngestTarget } from './ingest-target';
export type { MessageIngestorDeps } from './ingestor-deps';

export class MessageIngestor {
  private readonly created: CreatedIngest;
  private readonly placed: PlacedIngest;

  constructor(private readonly deps: MessageIngestorDeps) {
    this.created = new CreatedIngest(deps);
    this.placed = new PlacedIngest(deps);
  }

  ingest(target: IngestTarget, raw: RawMessage): Promise<IngestOutcome> {
    return this.ingestRemote(target, {
      remote: raw,
      source: raw.source,
      bodyState: 'local',
      parse: () => this.deps.parser.parse(raw.source),
    });
  }

  ingestSummary(target: IngestTarget, summary: RemoteMessageSummary): Promise<IngestOutcome> {
    return this.ingestRemote(
      { ...target, history: true },
      {
        remote: summary,
        source: null,
        bodyState: 'remote',
        parse: () => summaryMessage(this.deps.parser, summary),
      },
    );
  }

  private async ingestRemote(
    target: IngestTarget,
    fetched: FetchedMessage,
  ): Promise<IngestOutcome> {
    const identity = identityOf(target, fetched.remote, null);
    const match = await this.deps.messages.matchPlacement(identity);
    if (match === null) {
      return this.parseAndPlace(target, fetched);
    }
    const placed = await this.placed.apply(target, fetched, identity, match, null);
    return placed ?? this.parseAndPlace(target, fetched);
  }

  private async parseAndPlace(
    target: IngestTarget,
    fetched: FetchedMessage,
  ): Promise<IngestOutcome> {
    const parsed = await fetched.parse().catch((error: unknown) => error);
    if (!isParsed(parsed)) {
      return { kind: 'skipped', reason: errorMessage(parsed) };
    }
    const identity = identityOf(target, fetched.remote, parsed.messageIdHeader);
    const match = await this.deps.messages.matchPlacement(identity);
    if (match === null) {
      return this.created.create(target, fetched, identity, parsed);
    }
    const placed = await this.placed.apply(target, fetched, identity, match, parsed);
    return placed ?? this.created.create(target, fetched, identity, parsed);
  }
}

const isParsed = (value: unknown): value is ParsedMessage =>
  typeof value === 'object' && value !== null && !(value instanceof Error) && 'headers' in value;
