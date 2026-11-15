import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export const PageLimitSchema = z.coerce
  .number<number | string>()
  .int()
  .min(1)
  .max(MAX_PAGE_LIMIT)
  .default(DEFAULT_PAGE_LIMIT);

export const CursorSchema = z.string().min(1).max(1_024);

export const CursorPaginationQuerySchema = z.object({
  cursor: CursorSchema.optional(),
  limit: PageLimitSchema,
});
export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;

export const pageSchemaOf = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    nextCursor: CursorSchema.nullable(),
  });

export interface Page<Item> {
  readonly items: Item[];
  readonly nextCursor: string | null;
}
