import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { type AccountOverview, totalUnread } from '../../src/main/native/account-overview';
import { AccountOverviewUpdater } from '../../src/main/native/account-overview-updater';
import { ManualTime } from './support/manual-time';
import { withUnread } from './support/account-overviews';
import { createTestLogger } from './support/memory-log-sink';

describe('AccountOverviewUpdater refresh ordering', () => {
  it('reloads when a refresh arrives while the previous one is finishing', async () => {
    const yieldsBeforeSecondRefresh = [0, 1, 2, 3, 4, 5];
    const counted = await Promise.all(
      yieldsBeforeSecondRefresh.map(async (yields) => {
        let counts = 0;
        const updater = new AccountOverviewUpdater({
          hub: new EventHub<RealtimeEvent>(),
          source: {
            load: () => {
              counts += 1;
              return Promise.resolve(withUnread(counts));
            },
          },
          view: { show: () => undefined },
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
    const updater = new AccountOverviewUpdater({
      hub,
      source: {
        load: () => {
          const captured = unread;
          const delay = delays.shift() ?? 10;
          return new Promise<AccountOverview[]>((resolve) => {
            time.after(delay, () => {
              resolve(withUnread(captured));
            });
          });
        },
      },
      view: { show: (accounts) => badges.push(totalUnread(accounts)) },
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
