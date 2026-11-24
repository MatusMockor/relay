import type { Message, MessageId } from '@relay/shared/domain';
import {
  claimedGates,
  decidePlacement,
  type EffectGates,
  type PlacementCandidates,
  type PlacementIdentity,
  type PlacementMatch,
  type PlaceOutcome,
  type PlaceRequest,
  type PlacementWrite,
  placedKindOf,
  placementWriteOf,
  usesEmailIdentity,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { isPlacedAt, roleOfIn, withPlacement } from './memory-placements';
import { storePlacements } from './memory-placement-writes';

const keeperFirst = (db: MemoryDatabase, messages: readonly Message[]): Message[] => {
  const roleOf = roleOfIn(db);
  const inInbox = (message: Message): number =>
    message.placements.some((placement) => roleOf(placement.mailboxId) === 'inbox') ? 0 : 1;
  return [...messages].sort((a, b) => inInbox(a) - inInbox(b));
};

const oldestFirst = (messages: readonly Message[]): Message[] =>
  [...messages].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

const gather = (db: MemoryDatabase, identity: PlacementIdentity): PlacementCandidates => {
  const all = [...db.tables.messages.values()];
  const atLocation = all.find((message) => isPlacedAt(message, identity.location)) ?? null;
  if (atLocation !== null) {
    return { atLocation, byEmailId: [], byMessageId: [] };
  }
  const ofAccount = all.filter((message) => message.accountId === identity.accountId);
  const byEmailId = usesEmailIdentity(identity)
    ? keeperFirst(
        db,
        ofAccount.filter((message) => message.emailId === identity.emailId),
      )
    : [];
  if (byEmailId.length > 0 || identity.messageIdHeader === null) {
    return { atLocation, byEmailId, byMessageId: [] };
  }
  const byMessageId = oldestFirst(
    ofAccount.filter((message) => message.messageIdHeader === identity.messageIdHeader),
  );
  return { atLocation, byEmailId, byMessageId };
};

const gatesOf = (db: MemoryDatabase, messageId: MessageId): EffectGates => {
  const stored = db.tables.messageEffects.get(messageId);
  return { jira: (stored?.jira ?? null) !== null, invite: (stored?.invite ?? null) !== null };
};

const claim = (db: MemoryDatabase, messageId: MessageId, claimed: EffectGates, at: string) => {
  const stored = db.tables.messageEffects.get(messageId) ?? { jira: null, invite: null };
  db.tables.messageEffects.set(messageId, {
    jira: claimed.jira ? at : stored.jira,
    invite: claimed.invite ? at : stored.invite,
  });
};

export const matchPlacementIn = (
  db: MemoryDatabase,
  identity: PlacementIdentity,
): PlacementMatch | null => {
  const decision = decidePlacement(identity, gather(db, identity));
  if (decision.kind === 'create') {
    return null;
  }
  const { message } = decision;
  return { kind: placedKindOf(decision), message, gates: gatesOf(db, message.id) };
};

const create = (db: MemoryDatabase, request: PlaceRequest): PlaceOutcome => {
  if (request.create === null) {
    return { kind: 'unmatched' };
  }
  const { message, headers } = request.create;
  const stored = storePlacements(db, message, [request.location]);
  db.tables.messageHeaders.set(message.id, headers);
  claim(db, message.id, request.claims, request.at);
  return { kind: 'created', message: stored, previous: [], claimed: request.claims };
};

const applyWrite = (db: MemoryDatabase, write: PlacementWrite): Message => {
  if (write.placement === null && write.emailId === null) {
    return write.message;
  }
  const filled: Message =
    write.emailId === null ? write.message : { ...write.message, emailId: write.emailId };
  const placements =
    write.placement === null
      ? filled.placements
      : withPlacement(filled.placements, write.placement);
  return storePlacements(db, filled, placements);
};

export const placeIn = (db: MemoryDatabase, request: PlaceRequest): PlaceOutcome => {
  const decision = decidePlacement(request, gather(db, request));
  if (decision.kind === 'create') {
    return create(db, request);
  }
  const write = placementWriteOf(request, decision);
  const message = applyWrite(db, write);
  const claimed = claimedGates(request.claims, gatesOf(db, message.id));
  claim(db, message.id, claimed, request.at);
  return {
    kind: placedKindOf(decision),
    message,
    previous: decision.message.placements,
    claimed,
  };
};
