import { sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { KEEPER_IDS } from './merge-temp-tables';

const takeDonorContent = (db: RelayDb): void => {
  db.run(sql`
    update messages set
      text_body = donor.text_body,
      html_body = donor.html_body,
      snippet = donor.snippet,
      body_state = donor.body_state,
      attachments = donor.attachments,
      headers = donor.headers,
      message_id_header = coalesce(messages.message_id_header, donor.message_id_header)
    from temp.merge_keeper keeper
    inner join messages donor on donor.id = keeper.donor_id
    where messages.id = keeper.keeper_id and keeper.donor_id <> keeper.keeper_id
  `);
};

const takeMergedGates = (db: RelayDb): void => {
  db.run(sql`
    update messages set
      jira_effects_at = keeper.jira_effects_at,
      invite_effects_at = keeper.invite_effects_at
    from temp.merge_keeper keeper
    where messages.id in ${KEEPER_IDS}
      and messages.id = keeper.keeper_id
      and (messages.jira_effects_at is not keeper.jira_effects_at
        or messages.invite_effects_at is not keeper.invite_effects_at)
  `);
};

export const mergeKeeperContent = (db: RelayDb): void => {
  takeDonorContent(db);
  takeMergedGates(db);
};
