import type { RemoteMessageMeta } from '../../model/remote-mail';
import type { Repositories } from '../../ports/repositories';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { type PlacedMessage, recordPlaced } from './ingest-effects';
import type { IngestOutcome, IngestTarget } from './ingest-target';
import { flagsDiffer, sameMembers } from './message-diff';
import type { MessageLabelsResolver } from './message-labels-resolver';
import { syncedFlags } from './synced-flags';

export interface PlacedRefreshDeps {
  readonly labelsResolver: MessageLabelsResolver;
  readonly calendarParts: CalendarPartsSink;
}

export const refreshPlaced = async (
  deps: PlacedRefreshDeps,
  repositories: Repositories,
  target: IngestTarget,
  remote: RemoteMessageMeta,
  placed: PlacedMessage,
): Promise<IngestOutcome> => {
  const known = placed.outcome.message;
  await recordPlaced(repositories.pendingWork, deps.calendarParts, target, placed);
  const labelIds = await deps.labelsResolver.resolve(repositories, target.account.id, remote);
  const flags = await syncedFlags(repositories.pendingWork, known, remote.flags);
  const flagsChanged = flagsDiffer(known.flags, flags);
  const labelsChanged = !sameMembers(known.labelIds, labelIds);
  if (flagsChanged) {
    await repositories.messages.updateFlags(known.id, flags);
  }
  if (labelsChanged) {
    await repositories.messages.updateLabels(known.id, labelIds);
  }
  return {
    kind: 'existing',
    message: { ...known, flags, labelIds },
    changed: flagsChanged || labelsChanged,
    placed: placed.outcome.kind,
  };
};
