import { type Message, PENDING_UID, placementIn } from '@relay/shared/domain';
import type { PlacedKind, PlacementIdentity } from '../model/placement-ingest';

export interface PlacementCandidates {
  readonly atLocation: Message | null;
  readonly byEmailId: readonly Message[];
  readonly byMessageId: readonly Message[];
}

export type PlaceDecision =
  | { readonly kind: 'refresh'; readonly message: Message; readonly fillEmailId: boolean }
  | { readonly kind: 'attach'; readonly message: Message; readonly write: 'add' | 'replace' }
  | { readonly kind: 'stale'; readonly message: Message }
  | {
      readonly kind: 'adopt';
      readonly message: Message;
      readonly uid: 'set' | 'keep';
      readonly fillEmailId: boolean;
    }
  | { readonly kind: 'create' };

export type MatchedDecision = Exclude<PlaceDecision, { readonly kind: 'create' }>;

const CREATE: PlaceDecision = { kind: 'create' };

const fillsEmailId = (identity: PlacementIdentity, message: Message): boolean =>
  identity.emailId !== null && message.emailId === null;

const knownUidIn = (identity: PlacementIdentity, message: Message): number | undefined =>
  placementIn(message, identity.location.mailboxId)?.uid;

const soleOf = (messages: readonly Message[]): Message | undefined =>
  messages.length === 1 ? messages[0] : undefined;

export const usesEmailIdentity = (
  identity: PlacementIdentity,
): identity is PlacementIdentity & { readonly emailId: string } =>
  identity.labelBased && identity.emailId !== null;

const placeOnKeeper = (identity: PlacementIdentity, keeper: Message): MatchedDecision => {
  const known = knownUidIn(identity, keeper);
  if (known === undefined) {
    return { kind: 'attach', message: keeper, write: 'add' };
  }
  if (known === PENDING_UID) {
    return { kind: 'adopt', message: keeper, uid: 'set', fillEmailId: false };
  }
  if (known < identity.location.uid) {
    return { kind: 'attach', message: keeper, write: 'replace' };
  }
  return { kind: 'stale', message: keeper };
};

const adoptPending = (
  identity: PlacementIdentity,
  candidates: readonly Message[],
): MatchedDecision | null => {
  const pending = candidates.filter(
    (candidate) =>
      knownUidIn(identity, candidate) === PENDING_UID &&
      (!identity.labelBased || candidate.emailId === null),
  );
  const adopted = identity.labelBased ? soleOf(pending) : pending[0];
  if (adopted === undefined) {
    return null;
  }
  return {
    kind: 'adopt',
    message: adopted,
    uid: 'set',
    fillEmailId: fillsEmailId(identity, adopted),
  };
};

const adoptSentRecord = (
  identity: PlacementIdentity,
  candidates: readonly Message[],
): MatchedDecision | null => {
  if (!usesEmailIdentity(identity) || identity.role !== 'sent') {
    return null;
  }
  const record = soleOf(
    candidates.filter(
      (candidate) =>
        candidate.emailId === null && (knownUidIn(identity, candidate) ?? PENDING_UID) > 0,
    ),
  );
  if (record === undefined) {
    return null;
  }
  const known = knownUidIn(identity, record) ?? PENDING_UID;
  const uid = identity.location.uid > known ? 'set' : 'keep';
  return { kind: 'adopt', message: record, uid, fillEmailId: true };
};

const adoptPlaceholder = (
  identity: PlacementIdentity,
  candidates: readonly Message[],
): MatchedDecision | null => {
  if (identity.messageIdHeader === null) {
    return null;
  }
  return adoptPending(identity, candidates) ?? adoptSentRecord(identity, candidates);
};

export const decidePlacement = (
  identity: PlacementIdentity,
  candidates: PlacementCandidates,
): PlaceDecision => {
  if (candidates.atLocation !== null) {
    return {
      kind: 'refresh',
      message: candidates.atLocation,
      fillEmailId: fillsEmailId(identity, candidates.atLocation),
    };
  }
  const keeper = usesEmailIdentity(identity) ? candidates.byEmailId[0] : undefined;
  if (keeper !== undefined) {
    return placeOnKeeper(identity, keeper);
  }
  return adoptPlaceholder(identity, candidates.byMessageId) ?? CREATE;
};

const PLACED_KINDS: Readonly<Record<MatchedDecision['kind'], PlacedKind>> = {
  refresh: 'refreshed',
  stale: 'refreshed',
  attach: 'attached',
  adopt: 'adopted',
};

export const placedKindOf = (decision: MatchedDecision): PlacedKind => PLACED_KINDS[decision.kind];
