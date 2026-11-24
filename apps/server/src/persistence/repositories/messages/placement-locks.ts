import { type PlacementIdentity, usesEmailIdentity } from '@relay/engine';
import type { MessageId } from '@relay/shared/domain';
import { and, eq, or, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messagePlacements, messages } from '../../schema';
import { lockMessagesWhere } from './message-row-locks';

const advisoryLock = async (db: DbExecutor, key: string): Promise<void> => {
  await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
};

const placedAt = (identity: PlacementIdentity): SQL => sql`${messages.id} in (
  select ${messagePlacements.messageId} from ${messagePlacements}
  where ${messagePlacements.mailboxId} = ${identity.location.mailboxId}
    and ${messagePlacements.uid} = ${identity.location.uid}
)`;

const sameEmail = (identity: PlacementIdentity): SQL | undefined =>
  usesEmailIdentity(identity)
    ? and(eq(messages.accountId, identity.accountId), eq(messages.emailId, identity.emailId))
    : undefined;

const sameHeader = (identity: PlacementIdentity): SQL | undefined =>
  identity.messageIdHeader === null
    ? undefined
    : and(
        eq(messages.accountId, identity.accountId),
        eq(messages.messageIdHeader, identity.messageIdHeader),
      );

export const lockPlacementIdentity = async (
  db: DbExecutor,
  identity: PlacementIdentity,
): Promise<void> => {
  if (usesEmailIdentity(identity)) {
    await advisoryLock(db, `relay:email:${identity.accountId}:${identity.emailId}`);
  }
  await advisoryLock(db, `relay:loc:${identity.location.mailboxId}:${identity.location.uid}`);
};

export const lockPlacementCandidates = (
  db: DbExecutor,
  identity: PlacementIdentity,
): Promise<MessageId[]> =>
  lockMessagesWhere(
    db,
    or(placedAt(identity), sameEmail(identity), sameHeader(identity)) ?? placedAt(identity),
  );
