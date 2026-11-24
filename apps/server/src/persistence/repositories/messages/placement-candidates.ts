import { type PlacementCandidates, type PlacementIdentity, usesEmailIdentity } from '@relay/engine';
import type { Message } from '@relay/shared/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';
import { findAtLocation } from './message-locations';
import { messageSelection } from './message-selection';
import { toMessage } from './message.mapper';
import { placedInRole } from './placement-conditions';

const byEmailId = async (
  db: DbExecutor,
  identity: PlacementIdentity,
  emailId: string,
): Promise<Message[]> => {
  const rows = await db
    .select(messageSelection)
    .from(messages)
    .where(and(eq(messages.accountId, identity.accountId), eq(messages.emailId, emailId)))
    .orderBy(desc(placedInRole('inbox')), asc(messages.id));
  return rows.map(toMessage);
};

const byMessageId = async (
  db: DbExecutor,
  identity: PlacementIdentity,
  header: string,
): Promise<Message[]> => {
  const rows = await db
    .select(messageSelection)
    .from(messages)
    .where(and(eq(messages.accountId, identity.accountId), eq(messages.messageIdHeader, header)))
    .orderBy(asc(messages.date), asc(messages.id));
  return rows.map(toMessage);
};

export const gatherCandidates = async (
  db: DbExecutor,
  identity: PlacementIdentity,
): Promise<PlacementCandidates> => {
  const located = await findAtLocation(db, identity.location);
  if (located !== null) {
    return { atLocation: located, byEmailId: [], byMessageId: [] };
  }
  const keepers = usesEmailIdentity(identity)
    ? await byEmailId(db, identity, identity.emailId)
    : [];
  if (keepers.length > 0 || identity.messageIdHeader === null) {
    return { atLocation: null, byEmailId: keepers, byMessageId: [] };
  }
  return {
    atLocation: null,
    byEmailId: keepers,
    byMessageId: await byMessageId(db, identity, identity.messageIdHeader),
  };
};
