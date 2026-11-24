import type { TestStore } from './test-database';

export const mirrorPlacements = (store: TestStore): void => {
  store.database.sqlite.exec(
    'insert or ignore into message_placements (message_id, mailbox_id, uid) select id, mailbox_id, uid from messages',
  );
};
