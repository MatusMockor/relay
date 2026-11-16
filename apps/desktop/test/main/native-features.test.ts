import {
  AccountIdSchema,
  type NotificationMode,
  type ThreadSummary,
  ThreadIdSchema,
} from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { buildAppMenuTemplate } from '../../src/main/native/app-menu-template';
import { type MailNotification, NewMailNotifier } from '../../src/main/native/new-mail-notifier';
import { UnreadBadgeUpdater } from '../../src/main/native/unread-badge-updater';
import { fitWindowState } from '../../src/main/native/window-bounds';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

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

const thread = (id: string, lastMessageAt: string, unread = true): ThreadSummary => ({
  id: ThreadIdSchema.parse(id),
  accountId: AccountIdSchema.parse('acc_1'),
  subject: `Predmet ${id}`,
  participants: [{ name: 'Jana Nováková', email: 'jana@example.com' }],
  lastMessageAt,
  messageCount: 1,
  unread,
  snippet: '',
  aiOneLiner: null,
  jiraKey: null,
  jiraActor: null,
  splitIds: [],
  labelIds: [],
  state: 'inbox',
  remindAt: null,
  hasDraft: false,
});

const upserted = (summary: ThreadSummary): RealtimeEvent => ({
  type: 'thread.upserted',
  at: summary.lastMessageAt,
  data: { thread: summary },
});

describe('NewMailNotifier', () => {
  const setupWith = (mode: () => Promise<NotificationMode>) => {
    const time = new ManualTime('2026-11-15T08:00:00.000Z');
    const hub = new EventHub<RealtimeEvent>();
    const shown: MailNotification[] = [];
    const log = createTestLogger();
    const notifier = new NewMailNotifier({
      hub,
      presenter: { show: (notification) => shown.push(notification) },
      mode,
      clock: time,
      timers: time,
      logger: log.logger,
      digestIntervalMs: 60_000,
    });
    notifier.start();
    return { time, hub, shown, notifier, log };
  };

  const setup = (mode: NotificationMode) => setupWith(() => Promise.resolve(mode));

  const pendingMode = () => {
    let resolve: (mode: NotificationMode) => void = () => undefined;
    let calls = 0;
    const lookup = () => {
      calls += 1;
      return new Promise<NotificationMode>((done) => {
        resolve = done;
      });
    };
    const answer = (mode: NotificationMode) => {
      resolve(mode);
    };
    return { lookup, answer, calls: () => calls };
  };

  it('logs a failing notification lookup instead of leaking the rejection', async () => {
    const { time, hub, shown, log } = setupWith(() => Promise.reject(new Error('settings locked')));
    hub.publish(upserted(thread('new', '2026-11-15T08:01:00.000Z')));
    await time.advance(0);
    expect(shown).toEqual([]);
    expect(log.sink.messages()).toContain('Failed to show a new mail notification');
  });

  it('does not notify after stop when the mode lookup was still pending', async () => {
    const mode = pendingMode();
    const { time, hub, shown, notifier } = setupWith(mode.lookup);
    hub.publish(upserted(thread('new', '2026-11-15T08:01:00.000Z')));
    await time.advance(0);
    notifier.stop();
    mode.answer('urgent');
    await time.advance(0);
    expect(shown).toEqual([]);
  });

  it('does not show a digest after stop when the flush was still waiting for the mode', async () => {
    let mode: 'digest' | 'pending' = 'digest';
    const pending = pendingMode();
    const { time, hub, shown, notifier } = setupWith(() =>
      mode === 'digest' ? Promise.resolve('digest') : pending.lookup(),
    );
    hub.publish(upserted(thread('a', '2026-11-15T08:01:00.000Z')));
    await time.advance(0);
    mode = 'pending';
    await time.advance(60_000);
    expect(pending.calls()).toBe(1);
    notifier.stop();
    pending.answer('digest');
    await time.advance(0);
    expect(shown).toEqual([]);
  });

  it('notifies only about unread inbox mail that arrived after start in urgent mode', async () => {
    const { time, hub, shown } = setup('urgent');
    hub.publish(upserted(thread('old', '2026-11-14T08:00:00.000Z')));
    hub.publish(upserted(thread('new', '2026-11-15T08:01:00.000Z')));
    hub.publish(upserted(thread('new', '2026-11-15T08:01:00.000Z')));
    hub.publish(upserted(thread('read', '2026-11-15T08:02:00.000Z', false)));
    await time.advance(0);
    expect(shown).toEqual([
      {
        title: 'Jana Nováková',
        body: 'Predmet new',
        threadId: ThreadIdSchema.parse('new'),
      },
    ]);
  });

  it('stays quiet when notifications are off', async () => {
    const { time, hub, shown } = setup('off');
    hub.publish(upserted(thread('new', '2026-11-15T08:01:00.000Z')));
    await time.advance(120_000);
    expect(shown).toEqual([]);
  });

  it('batches new mail into one digest notification', async () => {
    const { time, hub, shown, notifier } = setup('digest');
    hub.publish(upserted(thread('a', '2026-11-15T08:01:00.000Z')));
    hub.publish(upserted(thread('b', '2026-11-15T08:01:00.000Z')));
    await time.advance(0);
    expect(shown).toEqual([]);
    await time.advance(60_000);
    expect(shown).toEqual([{ title: 'Relay', body: 'Máš 2 nové správy', threadId: null }]);
    notifier.stop();
  });

  it('drops a pending digest when notifications get switched off meanwhile', async () => {
    let mode: 'digest' | 'off' = 'digest';
    const time = new ManualTime('2026-11-15T08:00:00.000Z');
    const hub = new EventHub<RealtimeEvent>();
    const shown: MailNotification[] = [];
    const notifier = new NewMailNotifier({
      hub,
      presenter: { show: (notification) => shown.push(notification) },
      mode: () => Promise.resolve(mode),
      clock: time,
      timers: time,
      logger: createTestLogger().logger,
      digestIntervalMs: 60_000,
    });
    notifier.start();
    hub.publish(upserted(thread('a', '2026-11-15T08:01:00.000Z')));
    await time.advance(0);
    mode = 'off';
    await time.advance(60_000);
    expect(shown).toEqual([]);
    notifier.stop();
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
