import type { RealtimeEvent } from '@relay/shared/realtime';
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import {
  buildAppMenuTemplate,
  CHECK_FOR_UPDATES_ID,
} from '../../src/main/native/app-menu-template';
import { totalUnread } from '../../src/main/native/account-overview';
import { AccountOverviewUpdater } from '../../src/main/native/account-overview-updater';
import { fitWindowState } from '../../src/main/native/window-bounds';
import { withUnread } from './support/account-overviews';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { thread, upserted } from './support/thread-events';

const display = { x: 0, y: 0, width: 1920, height: 1080 };

describe('fitWindowState', () => {
  it('keeps saved bounds that are visible on a display', () => {
    const state = { x: 100, y: 80, width: 1200, height: 800, maximized: true };
    expect(fitWindowState(state, [display])).toEqual(state);
  });

  it('moves a window whose title bar is above the display back to the display top', () => {
    const second = { x: 1920, y: 0, width: 1920, height: 1080 };
    expect(
      fitWindowState({ x: 2000, y: -300, width: 1200, height: 800, maximized: false }, [
        display,
        second,
      ]),
    ).toEqual({ x: 2000, y: 0, width: 1200, height: 800, maximized: false });
  });

  it('drops the position when the window would be off screen and clamps the size', () => {
    expect(
      fitWindowState({ x: 4000, y: 80, width: 2560, height: 1440, maximized: false }, [display]),
    ).toEqual({ width: 1920, height: 1080, maximized: false });
  });
});

describe('buildAppMenuTemplate', () => {
  const roles = (template: ReturnType<typeof buildAppMenuTemplate>, label: string) => {
    const menu = template.find((item) => item.label === label);
    const submenu = Array.isArray(menu?.submenu) ? menu.submenu : [];
    return submenu.map((item) => item.role).filter((role) => role !== undefined);
  };

  it('starts with the app menu on macOS and has the standard edit shortcuts', () => {
    const template = buildAppMenuTemplate({
      platform: 'darwin',
      appName: 'Relay',
      isDevelopment: false,
      onCheckForUpdates: () => undefined,
    });
    expect(template[0]?.label).toBe('Relay');
    expect(roles(template, 'Súbor')).toEqual(['close']);
    expect(roles(template, 'Upraviť')).toEqual([
      'undo',
      'redo',
      'cut',
      'copy',
      'paste',
      'pasteAndMatchStyle',
      'delete',
      'selectAll',
    ]);
    expect(roles(template, 'Zobraziť')).not.toContain('toggleDevTools');
  });

  it('uses a file menu with quit on Linux and exposes dev tools in development', () => {
    const template = buildAppMenuTemplate({
      platform: 'linux',
      appName: 'Relay',
      isDevelopment: true,
      onCheckForUpdates: () => undefined,
    });
    expect(roles(template, 'Súbor')).toEqual(['quit']);
    expect(roles(template, 'Upraviť')).toContain('selectAll');
    expect(roles(template, 'Zobraziť')).toContain('toggleDevTools');
  });

  const submenuOf = (template: ReturnType<typeof buildAppMenuTemplate>, label: string) => {
    const menu = template.find((item) => item.label === label);
    return Array.isArray(menu?.submenu) ? menu.submenu : [];
  };

  const press = (item: MenuItemConstructorOptions | undefined): void => {
    expect(item?.click).toBeTypeOf('function');
    if (item?.click === undefined) {
      return;
    }
    Reflect.apply(item.click, undefined, []);
  };

  const menuWithCheck = (platform: NodeJS.Platform) => {
    const calls = { count: 0 };
    const template = buildAppMenuTemplate({
      platform,
      appName: 'Relay',
      isDevelopment: false,
      onCheckForUpdates: () => {
        calls.count += 1;
      },
    });
    return { template, calls };
  };

  it('offers the update check right under About on macOS', () => {
    const { template, calls } = menuWithCheck('darwin');
    const items = submenuOf(template, 'Relay');
    expect(items[0]?.role).toBe('about');
    const check = items[1];
    expect(check?.id).toBe(CHECK_FOR_UPDATES_ID);
    expect(check?.label).toBe('Skontrolovať aktualizácie…');
    press(check);
    expect(calls.count).toBe(1);
    expect(submenuOf(template, 'Súbor').some((item) => item.id === CHECK_FOR_UPDATES_ID)).toBe(
      false,
    );
  });

  it('offers the update check above quit in the Linux file menu', () => {
    const { template, calls } = menuWithCheck('linux');
    const items = submenuOf(template, 'Súbor');
    expect(items.map((item) => item.id ?? item.role ?? item.type)).toEqual([
      CHECK_FOR_UPDATES_ID,
      'separator',
      'quit',
    ]);
    const check = items[0];
    press(check);
    expect(calls.count).toBe(1);
  });
});

describe('AccountOverviewUpdater', () => {
  it('reloads the account overview once per burst of thread events', async () => {
    const time = new ManualTime();
    const hub = new EventHub<RealtimeEvent>();
    let unread = 3;
    let counts = 0;
    const badges: number[] = [];
    const updater = new AccountOverviewUpdater({
      hub,
      source: {
        load: () => {
          counts += 1;
          return Promise.resolve(withUnread(unread));
        },
      },
      view: { show: (accounts) => badges.push(totalUnread(accounts)) },
      timers: time,
      logger: createTestLogger().logger,
      debounceMs: 200,
    });
    updater.start();
    await time.advance(0);
    unread = 5;
    hub.publish(upserted(thread('a', '2026-11-15T08:01:00.000Z')));
    hub.publish(upserted(thread('b', '2026-11-15T08:01:00.000Z')));
    await time.advance(200);
    expect(badges).toEqual([3, 5]);
    expect(counts).toBe(2);
    updater.stop();
  });
});
