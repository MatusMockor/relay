import { describe, expect, it } from 'vitest';
import { repeatEvery } from '../../src/main/native/repeat-every';
import { ManualTime } from './support/manual-time';

describe('repeatEvery', () => {
  it('ticks on every interval until it is stopped', async () => {
    const time = new ManualTime();
    let ticks = 0;
    const stop = repeatEvery(time, 60_000, () => {
      ticks += 1;
    });
    await time.advance(59_000);
    expect(ticks).toBe(0);
    await time.advance(2 * 60_000);
    expect(ticks).toBe(2);
    stop();
    await time.advance(5 * 60_000);
    expect(ticks).toBe(2);
    expect(time.pendingCount).toBe(0);
  });
});
