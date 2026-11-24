import {
  claimedGates,
  ConflictError,
  decidePlacement,
  type PlaceDecision,
  type PlacementIdentity,
  type PlacementMatch,
  type PlaceOutcome,
  type PlaceRequest,
  placedKindOf,
  placementWriteOf,
} from '@relay/engine';
import type { Message, MessageId } from '@relay/shared/domain';
import type { DbExecutor } from '../../database/database';
import { claimGates, gateColumns, readGates } from './message-effect-gates';
import { replaceMessageLabels } from './message-labels-writer';
import { findStoredMessage } from './message-locations';
import { upsertPlacement } from './message-placement-writer';
import { lockMessages } from './message-row-locks';
import { fillEmailId, writeMessageRow } from './message-row-writer';
import { gatherCandidates } from './placement-candidates';
import { lockPlacementCandidates, lockPlacementIdentity } from './placement-locks';
import { refreshPrimaryMirror } from './primary-mirror';

const MAX_SETTLE_ATTEMPTS = 4;

const readPlaced = async (db: DbExecutor, messageId: MessageId): Promise<Message> => {
  const message = await findStoredMessage(db, messageId);
  if (message === null) {
    throw new Error(`Placed message ${messageId} is missing`);
  }
  return message;
};

const settleDecision = async (
  db: DbExecutor,
  identity: PlacementIdentity,
  locked: ReadonlySet<string>,
  attempt = 1,
): Promise<PlaceDecision> => {
  const decision = decidePlacement(identity, await gatherCandidates(db, identity));
  if (decision.kind === 'create' || locked.has(decision.message.id)) {
    return decision;
  }
  if (attempt >= MAX_SETTLE_ATTEMPTS) {
    throw new ConflictError(`Placement candidates of ${decision.message.id} keep changing`);
  }
  const relocked = await lockMessages(db, [decision.message.id]);
  return settleDecision(db, identity, new Set([...locked, ...relocked]), attempt + 1);
};

export const matchPlacementIn = async (
  db: DbExecutor,
  identity: PlacementIdentity,
): Promise<PlacementMatch | null> => {
  const decision = decidePlacement(identity, await gatherCandidates(db, identity));
  if (decision.kind === 'create') {
    return null;
  }
  const { message } = decision;
  return { kind: placedKindOf(decision), message, gates: await readGates(db, message.id) };
};

const createPlaced = async (db: DbExecutor, request: PlaceRequest): Promise<PlaceOutcome> => {
  if (request.create === null) {
    return { kind: 'unmatched' };
  }
  const { message, headers } = request.create;
  const located = { ...message, ...request.location, placements: [request.location] };
  await writeMessageRow(db, located, headers, gateColumns(request.claims, request.at));
  await upsertPlacement(db, message.id, request.location);
  await replaceMessageLabels(db, message.id, message.labelIds);
  return {
    kind: 'created',
    message: await readPlaced(db, message.id),
    previous: [],
    claimed: request.claims,
  };
};

export const placeMessage = (db: DbExecutor, request: PlaceRequest): Promise<PlaceOutcome> =>
  db.transaction(async (tx) => {
    await lockPlacementIdentity(tx, request);
    const locked = await lockPlacementCandidates(tx, request);
    const decision = await settleDecision(tx, request, new Set(locked));
    if (decision.kind === 'create') {
      return createPlaced(tx, request);
    }
    const write = placementWriteOf(request, decision);
    const messageId = write.message.id;
    const claimed = claimedGates(request.claims, await readGates(tx, messageId));
    if (write.emailId !== null) {
      await fillEmailId(tx, messageId, write.emailId);
    }
    if (write.placement !== null) {
      await upsertPlacement(tx, messageId, write.placement);
      await refreshPrimaryMirror(tx, [messageId]);
    }
    await claimGates(tx, messageId, claimed, request.at);
    return {
      kind: placedKindOf(decision),
      message: await readPlaced(tx, messageId),
      previous: decision.message.placements,
      claimed,
    };
  });
