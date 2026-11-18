import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { buildAppMenuTemplate } from '../../src/main/native/app-menu-template';
import { UnreadBadgeUpdater } from '../../src/main/native/unread-badge-updater';
import { fitWindowState } from '../../src/main/native/window-bounds';
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
    });
    expect(roles(template, 'Súbor')).toEqual(['quit']);
    expect(roles(template, 'Upraviť')).toContain('selectAll');
    expect(roles(template, 'Zobraziť')).toContain('toggleDevTools');
  });
});

describe('UnreadBadgeUpdater', () => {
  it('recounts unread threads once per burst of thread events', async () => {
    const time = new ManualTime();
    const hub = new EventHub<RealtimeEvent>();
    let unread = 3;
    let counts = 0;
    const badges: number[] = [];
    const updater = new UnreadBadgeUpdater({
      hub,
      source: {
        count: () => {
          counts += 1;
          return Promise.resolve(unread);
        },
      },
      view: { setUnread: (count) => badges.push(count) },
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
