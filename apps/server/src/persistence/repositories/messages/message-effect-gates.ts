import type { EffectGates } from '@relay/engine';
import type { MessageId } from '@relay/shared/domain';
import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages } from '../../schema';
import { toDate } from '../../support/timestamps';

export interface GateColumns {
  readonly jiraEffectsAt?: Date;
  readonly inviteEffectsAt?: Date;
}

export const readGates = async (db: DbExecutor, messageId: MessageId): Promise<EffectGates> => {
  const [row] = await db
    .select({ jira: messages.jiraEffectsAt, invite: messages.inviteEffectsAt })
    .from(messages)
    .where(eq(messages.id, messageId));
  return { jira: (row?.jira ?? null) !== null, invite: (row?.invite ?? null) !== null };
};

export const gateColumns = (claimed: EffectGates, at: string): GateColumns => ({
  ...(claimed.jira ? { jiraEffectsAt: toDate(at) } : {}),
  ...(claimed.invite ? { inviteEffectsAt: toDate(at) } : {}),
});

export const claimGates = async (
  db: DbExecutor,
  messageId: MessageId,
  claimed: EffectGates,
  at: string,
): Promise<void> => {
  if (!claimed.jira && !claimed.invite) {
    return;
  }
  const stamp = sql`${at}::timestamptz`;
  await db
    .update(messages)
    .set({
      ...(claimed.jira
        ? { jiraEffectsAt: sql`coalesce(${messages.jiraEffectsAt}, ${stamp})` }
        : {}),
      ...(claimed.invite
        ? { inviteEffectsAt: sql`coalesce(${messages.inviteEffectsAt}, ${stamp})` }
        : {}),
    })
    .where(eq(messages.id, messageId));
};
