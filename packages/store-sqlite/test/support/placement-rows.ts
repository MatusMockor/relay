import type { TestStore } from './test-database';

export interface PlacementRow {
  readonly messageId: string;
  readonly mailboxId: string;
  readonly uid: number;
}

export const placementRows = (store: TestStore): PlacementRow[] =>
  store.database.sqlite
    .prepare<
      [],
      PlacementRow
    >('select message_id as messageId, mailbox_id as mailboxId, uid from message_placements order by message_id, mailbox_id')
    .all();
