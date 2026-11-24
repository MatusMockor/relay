import type { LabelId } from '@relay/shared/domain';
import { getTableColumns, sql } from 'drizzle-orm';
import { messages } from '../../schema';

const { searchVector: _searchVector, ...messageColumns } = getTableColumns(messages);

export const messageSelection = {
  ...messageColumns,
  labelIds: sql<LabelId[]>`array(
    select ml.label_id from message_labels ml
    where ml.message_id = "messages"."id"
    order by ml.label_id
  )`,
  placements: sql<unknown>`coalesce(
    (
      select json_agg(json_build_object('mailboxId', mp.mailbox_id, 'uid', mp.uid) order by mp.mailbox_id)
      from message_placements mp
      where mp.message_id = "messages"."id"
    ),
    '[]'::json
  )`,
};
