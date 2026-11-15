import type { LabelId, SplitId } from '@relay/shared/domain';
import { getTableColumns, sql } from 'drizzle-orm';
import { threads } from '../../schema';

export const threadSelection = {
  ...getTableColumns(threads),
  splitIds: sql<SplitId[]>`array(
    select ts.split_id from thread_splits ts
    where ts.thread_id = "threads"."id"
    order by ts.split_id
  )`,
  labelIds: sql<LabelId[]>`array(
    select distinct ml.label_id from message_labels ml
    join messages m on m.id = ml.message_id
    where m.thread_id = "threads"."id"
    order by ml.label_id
  )`,
  hasDraft: sql<boolean>`exists(
    select 1 from drafts d where d.in_reply_to_thread_id = "threads"."id"
  )`,
};
