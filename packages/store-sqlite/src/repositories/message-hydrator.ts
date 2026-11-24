import type { Message } from '@relay/shared/domain';
import type { RelayDb } from '../database/sqlite-database';
import { toMessage } from '../mappers/message-mapper';
import type { MessageRow } from '../schema';
import { readMessageLabels } from './message-label-reader';
import { readMessagePlacements } from './message-placement-reader';

export const hydrateMessages = (db: RelayDb, rows: readonly MessageRow[]): Message[] => {
  const ids = rows.map((row) => row.id);
  const labels = readMessageLabels(db, ids);
  const placements = readMessagePlacements(db, ids);
  return rows.map((row) => toMessage(row, labels.get(row.id) ?? [], placements.get(row.id) ?? []));
};
