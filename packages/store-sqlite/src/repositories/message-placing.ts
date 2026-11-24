import {
  claimedGates,
  decidePlacement,
  type PlacementIdentity,
  type PlacementMatch,
  type PlaceOutcome,
  type PlaceRequest,
  placedKindOf,
  placementWriteOf,
} from '@relay/engine';
import type { Message } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messages } from '../schema';
import { claimGates, gateColumns, readGates } from './message-effect-gates';
import { hydrateMessages } from './message-hydrator';
import { upsertPlacement } from './message-placement-writer';
import { fillEmailId, replaceLabels, writeMessageRow } from './message-row-writer';
import { gatherCandidates } from './placement-candidates';
import { refreshPrimaryMirror } from './primary-mirror';

const readPlaced = (db: RelayDb, messageId: string): Message => {
  const [message] = hydrateMessages(
    db,
    db.select().from(messages).where(eq(messages.id, messageId)).all(),
  );
  if (message === undefined) {
    throw new Error(`Placed message ${messageId} is missing`);
  }
  return message;
};

export const matchPlacementIn = (
  db: RelayDb,
  identity: PlacementIdentity,
): PlacementMatch | null => {
  const decision = decidePlacement(identity, gatherCandidates(db, identity));
  if (decision.kind === 'create') {
    return null;
  }
  const { message } = decision;
  return { kind: placedKindOf(decision), message, gates: readGates(db, message.id) };
};

const createPlaced = (db: RelayDb, request: PlaceRequest): PlaceOutcome => {
  if (request.create === null) {
    return { kind: 'unmatched' };
  }
  const { message, headers } = request.create;
  const located = { ...message, ...request.location, placements: [request.location] };
  writeMessageRow(db, located, headers, gateColumns(request.claims, request.at));
  upsertPlacement(db, message.id, request.location);
  replaceLabels(db, message.id, message.labelIds);
  return {
    kind: 'created',
    message: readPlaced(db, message.id),
    previous: [],
    claimed: request.claims,
  };
};

export const placeMessage = (db: RelayDb, request: PlaceRequest): PlaceOutcome => {
  const decision = decidePlacement(request, gatherCandidates(db, request));
  if (decision.kind === 'create') {
    return createPlaced(db, request);
  }
  const write = placementWriteOf(request, decision);
  const messageId = write.message.id;
  const claimed = claimedGates(request.claims, readGates(db, messageId));
  if (write.emailId !== null) {
    fillEmailId(db, messageId, write.emailId);
  }
  if (write.placement !== null) {
    upsertPlacement(db, messageId, write.placement);
    refreshPrimaryMirror(db, [messageId]);
  }
  claimGates(db, messageId, claimed, request.at);
  return {
    kind: placedKindOf(decision),
    message: readPlaced(db, messageId),
    previous: decision.message.placements,
    claimed,
  };
};
