import { type PendingOverrides, type PendingWork, pendingOverrides } from '@relay/engine';
import type { AccountId, MessageId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';

interface KeeperOverrides {
  readonly keeperId: MessageId;
  readonly overrides: PendingOverrides;
}

interface LabelOverride {
  readonly keeperId: MessageId;
  readonly remoteName: string;
  readonly value: boolean;
}

const overridesByKeeper = (ops: readonly PendingWork<'provider-op'>[]): KeeperOverrides[] => {
  const byKeeper = new Map<MessageId, PendingWork<'provider-op'>[]>();
  ops.forEach((op) => {
    byKeeper.set(op.payload.messageId, [...(byKeeper.get(op.payload.messageId) ?? []), op]);
  });
  return [...byKeeper].map(([keeperId, owned]) => ({
    keeperId,
    overrides: pendingOverrides(owned),
  }));
};

const applyFlags = async (db: DbExecutor, keepers: readonly KeeperOverrides[]): Promise<void> => {
  const flagged = keepers.filter(({ overrides }) => Object.keys(overrides.flags).length > 0);
  if (flagged.length === 0) {
    return;
  }
  await db.execute(sql`update messages m
    set seen = coalesce(o.seen, m.seen), flagged = coalesce(o.flagged, m.flagged)
    from unnest(
      ${sql.param(flagged.map(({ keeperId }) => keeperId))}::text[],
      ${sql.param(flagged.map(({ overrides }) => overrides.flags.seen ?? null))}::boolean[],
      ${sql.param(flagged.map(({ overrides }) => overrides.flags.flagged ?? null))}::boolean[]
    ) as o(id, seen, flagged)
    where m.id = o.id
      and (m.seen, m.flagged) is distinct from (coalesce(o.seen, m.seen), coalesce(o.flagged, m.flagged))`);
};

const applyLabels = async (
  db: DbExecutor,
  accountId: AccountId,
  keepers: readonly KeeperOverrides[],
): Promise<void> => {
  const labelled: LabelOverride[] = keepers.flatMap(({ keeperId, overrides }) =>
    [...overrides.labels].map(([remoteName, value]) => ({ keeperId, remoteName, value })),
  );
  if (labelled.length === 0) {
    return;
  }
  await db.execute(sql`with wanted as (
      select o.message_id, l.id as label_id, o.value
      from unnest(
        ${sql.param(labelled.map((label) => label.keeperId))}::text[],
        ${sql.param(labelled.map((label) => label.remoteName))}::text[],
        ${sql.param(labelled.map((label) => label.value))}::boolean[]
      ) as o(message_id, remote_name, value)
      inner join labels l on l.account_id = ${accountId} and l.kind = 'gmail'
        and l.remote_name = o.remote_name
    ),
    removed as (
      delete from message_labels ml using wanted
      where not wanted.value and ml.message_id = wanted.message_id and ml.label_id = wanted.label_id
    )
    insert into message_labels (message_id, label_id, user_id)
    select wanted.message_id, wanted.label_id, m.user_id
    from wanted inner join messages m on m.id = wanted.message_id
    where wanted.value
    on conflict do nothing`);
};

export const applyPendingOverrides = async (
  db: DbExecutor,
  accountId: AccountId,
  ops: readonly PendingWork<'provider-op'>[],
): Promise<void> => {
  const keepers = overridesByKeeper(ops);
  await applyFlags(db, keepers);
  await applyLabels(db, accountId, keepers);
};
