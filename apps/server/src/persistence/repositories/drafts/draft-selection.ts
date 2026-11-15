import type { DraftAttachment } from '@relay/shared/domain';
import { getTableColumns, sql } from 'drizzle-orm';
import { drafts } from '../../schema';

export const draftSelection = {
  ...getTableColumns(drafts),
  attachments: sql<DraftAttachment[]>`coalesce((
    select json_agg(
      json_build_object(
        'id', a.id,
        'filename', a.filename,
        'contentType', a.content_type,
        'size', a.size
      ) order by da.position
    )
    from draft_attachments da
    join attachments a on a.id = da.attachment_id
    where da.draft_id = "drafts"."id"
  ), '[]'::json)`,
};
