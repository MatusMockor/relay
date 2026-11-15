import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { UnreadBadgeUpdater } from '../../src/main/native/unread-badge-updater';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

describe('UnreadBadgeUpdater refresh ordering', () => {
  it('recounts when a refresh arrives while the previous one is finishing', async () => {
    const yieldsBeforeSecondRefresh = [0, 1, 2, 3, 4, 5];
    const counted = await Promise.all(
      yieldsBeforeSecondRefresh.map(async (yields) => {
        let counts = 0;
        const updater = new UnreadBadgeUpdater({
          hub: new EventHub<RealtimeEvent>(),
          source: {
            count: () => {
              counts += 1;
              return Promise.resolve(counts);
            },
          },
          view: { setUnread: () => undefined },
          timers: new ManualTime(),
          logger: createTestLogger().logger,
        });
        const first = updater.refresh();
        for (let index = 0; index < yields; index += 1) {
          await Promise.resolve();
        }
        await Promise.all([first, updater.refresh()]);
        return counts;
      }),
    );

    expect(counted).toEqual(yieldsBeforeSecondRefresh.map(() => 2));
  });

  it('never lets an older count overwrite a newer one', async () => {
    const time = new ManualTime();
    const hub = new EventHub<RealtimeEvent>();
    const delays = [100, 10];
    let unread = 4;
    const badges: number[] = [];
    const updater = new UnreadBadgeUpdater({
      hub,
      source: {
        count: () => {
          const captured = unread;
          const delay = delays.shift() ?? 10;
          return new Promise<number>((resolve) => {
            time.after(delay, () => {
              resolve(captured);
            });
          });
        },
      },
      view: { setUnread: (count) => badges.push(count) },
      timers: time,
      logger: createTestLogger().logger,
    });

    const older = updater.refresh();
    unread = 0;
    const newer = updater.refresh();
    await time.advance(200);
    await Promise.all([older, newer]);

    expect(badges.at(-1)).toBe(0);
  });
});
