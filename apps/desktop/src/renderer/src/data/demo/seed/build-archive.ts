import type { DemoThreadRecord } from '../demo-state';
import { buildThreadRecord } from './build-threads';
import { ARCHIVE_THREADS } from './threads-archive';

const ARCHIVE_ORDER_OFFSET = 900;

export const buildArchive = (now: Date): Map<string, DemoThreadRecord> =>
  new Map(
    ARCHIVE_THREADS.map((seed, order) => [
      seed.id,
      buildThreadRecord(seed, now, ARCHIVE_ORDER_OFFSET + order),
    ]),
  );
