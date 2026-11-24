import {
  overlayFlags,
  overlayLabels,
  type PendingOverrides,
  type PendingWork,
  pendingOverrides,
} from '@relay/engine';
import { and, eq, sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { toPendingWork } from '../../mappers/pending-work-mapper';
import { labels, messageLabels, messages, pendingWork } from '../../schema';
import { replaceLabels } from '../message-row-writer';
import { KEEPER_IDS } from './merge-temp-tables';

type ProviderOp = PendingWork<'provider-op'>;

const keeperOps = (db: RelayDb, accountId: string): Map<string, ProviderOp[]> => {
  const byKeeper = new Map<string, ProviderOp[]>();
  db.select()
    .from(pendingWork)
    .where(
      and(
        eq(pendingWork.accountId, accountId),
        eq(pendingWork.kind, 'provider-op'),
        sql`json_extract(${pendingWork.payload}, '$.messageId') in ${KEEPER_IDS}`,
      ),
    )
    .all()
    .map((row) => toPendingWork<'provider-op'>(row))
    .forEach((op) => {
      const keeper = op.payload.messageId;
      byKeeper.set(keeper, [...(byKeeper.get(keeper) ?? []), op]);
    });
  return byKeeper;
};

const applyFlags = (db: RelayDb, keeperId: string, overrides: PendingOverrides): void => {
  if (Object.keys(overrides.flags).length === 0) {
    return;
  }
  const current = db
    .select({ seen: messages.seen, flagged: messages.flagged, answered: messages.answered })
    .from(messages)
    .where(eq(messages.id, keeperId))
    .get();
  if (current === undefined) {
    return;
  }
  const next = overlayFlags(current, overrides);
  if (next.seen === current.seen && next.flagged === current.flagged) {
    return;
  }
  db.update(messages)
    .set({ seen: next.seen, flagged: next.flagged })
    .where(eq(messages.id, keeperId))
    .run();
};

const gmailLabelIds = (db: RelayDb, accountId: string): Map<string, string> =>
  new Map(
    db
      .select({ id: labels.id, remoteName: labels.remoteName })
      .from(labels)
      .where(and(eq(labels.accountId, accountId), eq(labels.kind, 'gmail')))
      .all()
      .map((label) => [label.remoteName, label.id]),
  );

const applyLabels = (
  db: RelayDb,
  keeperId: string,
  overrides: PendingOverrides,
  labelIds: () => Map<string, string>,
): void => {
  if (overrides.labels.size === 0) {
    return;
  }
  const current = db
    .select({ labelId: messageLabels.labelId })
    .from(messageLabels)
    .where(eq(messageLabels.messageId, keeperId))
    .all()
    .map((row) => row.labelId);
  const byRemote = labelIds();
  const next = overlayLabels(current, overrides, (remoteName) => byRemote.get(remoteName));
  const unchanged = next.length === current.length && next.every((id) => current.includes(id));
  if (unchanged) {
    return;
  }
  replaceLabels(db, keeperId, next);
};

export const applyPendingOverrides = (db: RelayDb, accountId: string): void => {
  let labelIds: Map<string, string> | null = null;
  const lazyLabelIds = (): Map<string, string> => {
    labelIds ??= gmailLabelIds(db, accountId);
    return labelIds;
  };
  keeperOps(db, accountId).forEach((ops, keeperId) => {
    const overrides = pendingOverrides(ops);
    applyFlags(db, keeperId, overrides);
    applyLabels(db, keeperId, overrides, lazyLabelIds);
  });
};
