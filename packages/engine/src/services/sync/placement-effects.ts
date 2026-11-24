import type { MessagePlacement } from '@relay/shared/domain';
import type { EffectGates, PlacedKind, PlacementMatch } from '../../model/placement-ingest';
import { acceptsInvites } from '../calendar/invite-queue';
import type { IngestTarget } from './ingest-target';
import { acceptsJiraEvents } from './jira-event-roles';

const NO_CLAIMS: EffectGates = { jira: false, invite: false };

export const effectClaims = (target: IngestTarget, parsed: boolean): EffectGates => {
  if (!parsed || target.history === true) {
    return NO_CLAIMS;
  }
  const { role } = target.mailbox;
  return { jira: acceptsJiraEvents(role), invite: acceptsInvites(role) };
};

export const arrivesIn = (
  target: IngestTarget,
  kind: PlacedKind,
  previous: readonly MessagePlacement[],
): boolean =>
  target.history !== true &&
  target.mailbox.role === 'inbox' &&
  kind === 'attached' &&
  !previous.some((placement) => placement.mailboxId === target.mailbox.id);

const opensEffects = (target: IngestTarget, gates: EffectGates): boolean => {
  const claims = effectClaims(target, true);
  return (claims.jira && !gates.jira) || (claims.invite && !gates.invite);
};

export const needsParse = (target: IngestTarget, match: PlacementMatch): boolean =>
  opensEffects(target, match.gates) || arrivesIn(target, match.kind, match.message.placements);
