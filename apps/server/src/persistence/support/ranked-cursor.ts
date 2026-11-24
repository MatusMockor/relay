import { ValidationError } from '@relay/engine';
import { z } from 'zod';

const RankedPositionSchema = z.object({
  rank: z.number().int(),
  t: z.iso.datetime({ offset: true }),
  id: z.string().min(1),
});

export type RankedPosition = z.infer<typeof RankedPositionSchema>;

export const encodeRankedCursor = (position: RankedPosition): string =>
  Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};

export const decodeRankedCursor = (cursor: string | null): RankedPosition | null => {
  if (cursor === null) {
    return null;
  }
  const result = RankedPositionSchema.safeParse(parseJson(cursor));
  if (!result.success) {
    throw new ValidationError('Invalid pagination cursor');
  }
  return result.data;
};
