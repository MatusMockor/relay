import { ValidationError } from '@relay/engine';
import { z } from 'zod';

const CursorPayloadSchema = z.object({
  t: z.iso.datetime({ offset: true }),
  id: z.string().min(1),
});

export type CursorPayload = z.infer<typeof CursorPayloadSchema>;

export const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export const decodeCursor = (cursor: string | null): CursorPayload | null => {
  if (cursor === null) {
    return null;
  }
  const result = CursorPayloadSchema.safeParse(parseJson(cursor));
  if (!result.success) {
    throw new ValidationError('Invalid pagination cursor');
  }
  return result.data;
};

export const pageOf = <Item>(
  rows: readonly Item[],
  limit: number,
  cursorOf: (item: Item) => CursorPayload,
): { items: Item[]; nextCursor: string | null } => {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  if (rows.length <= limit || last === undefined) {
    return { items, nextCursor: null };
  }
  return { items, nextCursor: encodeCursor(cursorOf(last)) };
};
