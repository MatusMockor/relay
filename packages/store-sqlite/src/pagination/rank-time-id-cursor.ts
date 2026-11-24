import { z } from 'zod';
import { CursorCodec } from './cursor-codec';

const RankTimeIdPositionSchema = z.object({
  rank: z.number().int(),
  ts: z.number().int(),
  id: z.string().min(1),
});

export type RankTimeIdPosition = z.infer<typeof RankTimeIdPositionSchema>;

export const rankTimeIdCursor = new CursorCodec<RankTimeIdPosition>(RankTimeIdPositionSchema);
