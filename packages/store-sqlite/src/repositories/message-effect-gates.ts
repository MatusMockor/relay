import type { EffectGates } from '@relay/engine';
import { eq, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messages } from '../schema';
import type { GateColumns } from './message-row-writer';

export const readGates = (db: RelayDb, messageId: string): EffectGates => {
  const row = db
    .select({ jira: messages.jiraEffectsAt, invite: messages.inviteEffectsAt })
    .from(messages)
    .where(eq(messages.id, messageId))
    .get();
  return { jira: (row?.jira ?? null) !== null, invite: (row?.invite ?? null) !== null };
};

export const gateColumns = (claimed: EffectGates, at: string): GateColumns => ({
  ...(claimed.jira ? { jiraEffectsAt: at } : {}),
  ...(claimed.invite ? { inviteEffectsAt: at } : {}),
});

export const claimGates = (
  db: RelayDb,
  messageId: string,
  claimed: EffectGates,
  at: string,
): void => {
  if (!claimed.jira && !claimed.invite) {
    return;
  }
  db.update(messages)
    .set({
      ...(claimed.jira ? { jiraEffectsAt: sql`coalesce(${messages.jiraEffectsAt}, ${at})` } : {}),
      ...(claimed.invite
        ? { inviteEffectsAt: sql`coalesce(${messages.inviteEffectsAt}, ${at})` }
        : {}),
    })
    .where(eq(messages.id, messageId))
    .run();
};
