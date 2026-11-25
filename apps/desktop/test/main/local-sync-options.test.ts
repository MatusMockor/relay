import { DEFAULT_HISTORY_OPTIONS, DEFAULT_SYNC_OPTIONS } from '@relay/engine';
import { describe, expect, it } from 'vitest';
import { localSyncOptions } from '../../src/main/composition/local-sync-options';

describe('local sync options', () => {
  it('uses a 14-day initial window because history backfill imports the older mail', () => {
    expect(localSyncOptions(undefined)).toEqual({ initialWindowDays: 14 });
    expect(DEFAULT_SYNC_OPTIONS.initialWindowDays).toBe(30);
  });

  it('merges history overrides over the engine defaults', () => {
    expect(localSyncOptions({ batch: 5 })).toEqual({
      initialWindowDays: 14,
      history: { ...DEFAULT_HISTORY_OPTIONS, batch: 5 },
    });
  });
});
