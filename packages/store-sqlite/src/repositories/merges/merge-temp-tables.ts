import type { GroupMergePlan } from '@relay/engine';
import { type SQL, sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { chunked } from '../chunked';

export const LOSER_IDS: SQL = sql`(select loser_id from temp.merge_map)`;

export const KEEPER_IDS: SQL = sql`(select keeper_id from temp.merge_keeper)`;

export const MEMBER_IDS: SQL = sql`(select loser_id from temp.merge_map union all select keeper_id from temp.merge_keeper)`;

const TABLES = [
  'create temp table if not exists merge_map (loser_id text primary key, keeper_id text not null)',
  'create temp table if not exists merge_keeper (keeper_id text primary key, donor_id text not null, jira_effects_at text, invite_effects_at text)',
  'create temp table if not exists merge_drop (message_id text not null, mailbox_id text not null, primary key (message_id, mailbox_id))',
] as const;

const TEMP_NAMES = ['merge_map', 'merge_keeper', 'merge_drop'] as const;

const insertRows = (db: RelayDb, into: SQL, rows: readonly SQL[]): void => {
  chunked(rows, 200).forEach((chunk) => {
    db.run(sql`insert into ${into} values ${sql.join(chunk, sql`, `)}`);
  });
};

export const resetMergeTables = (db: RelayDb): void => {
  TABLES.forEach((statement) => {
    db.run(sql.raw(statement));
  });
  TEMP_NAMES.forEach((name) => {
    db.run(sql.raw(`delete from temp.${name}`));
  });
};

export const fillMergeTables = (db: RelayDb, plans: readonly GroupMergePlan[]): void => {
  insertRows(
    db,
    sql`temp.merge_map (loser_id, keeper_id)`,
    plans.flatMap(({ keeper, losers }) => losers.map((loser) => sql`(${loser.id}, ${keeper.id})`)),
  );
  insertRows(
    db,
    sql`temp.merge_keeper (keeper_id, donor_id, jira_effects_at, invite_effects_at)`,
    plans.map(
      ({ keeper, donor, gates }) =>
        sql`(${keeper.id}, ${donor.id}, ${gates.jiraEffectsAt}, ${gates.inviteEffectsAt})`,
    ),
  );
  insertRows(
    db,
    sql`temp.merge_drop (message_id, mailbox_id)`,
    plans.flatMap(({ placements }) =>
      placements.dropped.map(
        ({ messageId, placement }) => sql`(${messageId}, ${placement.mailboxId})`,
      ),
    ),
  );
};
