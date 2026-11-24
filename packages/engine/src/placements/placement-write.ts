import type { Message, MessagePlacement } from '@relay/shared/domain';
import type { EffectGates, PlacementIdentity } from '../model/placement-ingest';
import type { MatchedDecision } from './place-decision';

export interface PlacementWrite {
  readonly message: Message;
  readonly placement: MessagePlacement | null;
  readonly emailId: string | null;
}

const writesPlacement = (decision: MatchedDecision): boolean => {
  if (decision.kind === 'attach') {
    return true;
  }
  return decision.kind === 'adopt' && decision.uid === 'set';
};

const fillsEmailId = (decision: MatchedDecision): boolean =>
  (decision.kind === 'refresh' || decision.kind === 'adopt') && decision.fillEmailId;

export const placementWriteOf = (
  identity: PlacementIdentity,
  decision: MatchedDecision,
): PlacementWrite => ({
  message: decision.message,
  placement: writesPlacement(decision) ? identity.location : null,
  emailId: fillsEmailId(decision) ? identity.emailId : null,
});

export const claimedGates = (claims: EffectGates, stored: EffectGates): EffectGates => ({
  jira: claims.jira && !stored.jira,
  invite: claims.invite && !stored.invite,
});
