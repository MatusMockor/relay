import { type PlacementCandidates, type PlacementIdentity, usesEmailIdentity } from '@relay/engine';
import type { Message } from '@relay/shared/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messages } from '../schema';
import { findRowsAtLocation } from './message-location-queries';
import { hydrateMessages } from './message-hydrator';
import { placedInRole } from './placement-conditions';

const atLocation = (db: RelayDb, identity: PlacementIdentity): Message | null =>
  hydrateMessages(db, findRowsAtLocation(db, identity.location))[0] ?? null;

const byEmailId = (db: RelayDb, identity: PlacementIdentity, emailId: string): Message[] =>
  hydrateMessages(
    db,
    db
      .select()
      .from(messages)
      .where(and(eq(messages.accountId, identity.accountId), eq(messages.emailId, emailId)))
      .orderBy(desc(placedInRole('inbox')), asc(messages.seq))
      .all(),
  );

const byMessageId = (db: RelayDb, identity: PlacementIdentity, header: string): Message[] =>
  hydrateMessages(
    db,
    db
      .select()
      .from(messages)
      .where(and(eq(messages.accountId, identity.accountId), eq(messages.messageIdHeader, header)))
      .orderBy(asc(messages.dateTs), asc(messages.seq))
      .all(),
  );

export const gatherCandidates = (db: RelayDb, identity: PlacementIdentity): PlacementCandidates => {
  const located = atLocation(db, identity);
  if (located !== null) {
    return { atLocation: located, byEmailId: [], byMessageId: [] };
  }
  const keepers = usesEmailIdentity(identity) ? byEmailId(db, identity, identity.emailId) : [];
  if (keepers.length > 0 || identity.messageIdHeader === null) {
    return { atLocation: null, byEmailId: keepers, byMessageId: [] };
  }
  return {
    atLocation: null,
    byEmailId: keepers,
    byMessageId: byMessageId(db, identity, identity.messageIdHeader),
  };
};
