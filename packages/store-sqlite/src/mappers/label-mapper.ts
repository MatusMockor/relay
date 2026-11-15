import { type Label, LabelSchema } from '@relay/shared/domain';
import type { LabelRow } from '../schema';

export const toLabel = (row: LabelRow): Label =>
  LabelSchema.parse({ id: row.id, accountId: row.accountId, name: row.name, color: row.color });
