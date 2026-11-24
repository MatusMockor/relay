import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { MERGE_KEEPER, MERGE_MAP, type MergeIds } from './merge-tables';

const takeDonorContent = async (db: DbExecutor, ids: MergeIds): Promise<void> => {
  await db.execute(sql`update messages k set
      text_body = d.text_body,
      html_body = d.html_body,
      snippet = d.snippet,
      attachments = d.attachments,
      headers = d.headers,
      message_id_header = coalesce(k.message_id_header, d.message_id_header)
    from ${MERGE_KEEPER} mk inner join messages d on d.id = mk.donor_id
    where k.id = any(${ids.keepers}) and d.id = any(${ids.donors})
      and k.id = mk.keeper_id and mk.donor_id <> mk.keeper_id
      and (k.text_body, k.html_body, k.snippet, k.attachments, k.headers, k.message_id_header)
        is distinct from
        (d.text_body, d.html_body, d.snippet, d.attachments, d.headers,
          coalesce(k.message_id_header, d.message_id_header))`);
};

const takeMergedGates = async (db: DbExecutor, ids: MergeIds): Promise<void> => {
  await db.execute(sql`update messages k set
      jira_effects_at = merged.jira_effects_at,
      invite_effects_at = merged.invite_effects_at
    from (
      select member.keeper_id,
        min(m.jira_effects_at) as jira_effects_at,
        min(m.invite_effects_at) as invite_effects_at
      from (
        select loser_id as message_id, keeper_id from ${MERGE_MAP}
        union all select keeper_id, keeper_id from ${MERGE_KEEPER}
      ) as member
      inner join messages m on m.id = member.message_id
      where m.id = any(${ids.losers}) or m.id = any(${ids.keepers})
      group by member.keeper_id
    ) as merged
    where k.id = any(${ids.keepers}) and k.id = merged.keeper_id
      and (k.jira_effects_at, k.invite_effects_at)
        is distinct from (merged.jira_effects_at, merged.invite_effects_at)`);
};

export const takeKeeperFields = async (db: DbExecutor, ids: MergeIds): Promise<void> => {
  await takeDonorContent(db, ids);
  await takeMergedGates(db, ids);
};
