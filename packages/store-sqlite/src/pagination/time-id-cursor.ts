import { z } from 'zod';
import { CursorCodec } from './cursor-codec';

const TimeIdPositionSchema = z.object({ ts: z.number().int(), id: z.string().min(1) });

export type TimeIdPosition = z.infer<typeof TimeIdPositionSchema>;

export const timeIdCursor = new CursorCodec<TimeIdPosition>(TimeIdPositionSchema);
