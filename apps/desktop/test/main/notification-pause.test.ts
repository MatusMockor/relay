import { AutomationIdSchema, ThreadIdSchema } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { AutomationNotifier } from '../../src/main/native/automation-notifier';
import { NewMailNotifier } from '../../src/main/native/new-mail-notifier';
import {
  NotificationPause,
  type NotificationPauseState,
} from '../../src/main/native/notification-pause';
import { PausableNotificationPresenter } from '../../src/main/native/pausable-notification-presenter';
import { nextMorning, pauseEnd } from '../../src/main/native/pause-end';
import {
  type NotificationFactory,
  type ShownNotification,
  SystemNotificationPresenter,
} from '../../src/main/native/system-notification-presenter';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { thread, upserted } from './support/thread-events';

const HOUR_MS = 60 * 60_000;

class RecordingNotificationCenter implements NotificationFactory {
  readonly shown: string[] = [];

  isSupported(): boolean {
    return true;
  }

  create(options: { title: string; body: string }): ShownNotification {
    return {
      onClick: () => undefined,
      onDismiss: () => undefined,
      show: () => {
        this.shown.push(`${options.title}: ${options.body}`);
      },
      close: () => undefined,
    };
  }
}

const automationNotified = (body: string): RealtimeEvent => ({
  type: 'automation.notified',
  at: '2026-11-15T08:00:00.000Z',
  data: {
    automationId: AutomationIdSchema.parse('automation-1'),
    automationName: 'Od Tibora',
    threadId: ThreadIdSchema.parse('thr-1'),
    title: 'Tibor',
    body,
  },
});

const setup = () => {
  const time = new ManualTime('2026-11-15T08:00:00.000Z');
  const hub = new EventHub<RealtimeEvent>();
  const center = new RecordingNotificationCenter();
  const pause = new NotificationPause(time, time);
  const changes: NotificationPauseState[] = [];
  pause.changes.subscribe((state) => changes.push(state));
  const presenter = new PausableNotificationPresenter(
    new SystemNotificationPresenter(
      center,
      () => undefined,
      () => undefined,
    ),
    pause,
  );
  const mail = new NewMailNotifier({
    hub,
    presenter,
    mode: () => Promise.resolve('urgent'),
    clock: time,
    timers: time,
    logger: createTestLogger().logger,
  });
  const automations = new AutomationNotifier(hub, presenter);
  mail.start();
  automations.start();
  return { time, hub, center, pause, changes };
};

describe('pauseEnd', () => {
  it('ends an hour pause an hour later and a morning pause at the next 8:00', () => {
    const now = new Date(2026, 10, 15, 23, 40);
    expect(pauseEnd('hour', now)).toEqual(new Date(now.getTime() + HOUR_MS));
    expect(pauseEnd('morning', now)).toEqual(new Date(2026, 10, 16, 8, 0));
    expect(pauseEnd('indefinite', now)).toBeNull();
    expect(nextMorning(new Date(2026, 11, 31, 1, 15))).toEqual(new Date(2026, 11, 31, 8, 0));
    expect(nextMorning(new Date(2026, 11, 31, 8, 0))).toEqual(new Date(2027, 0, 1, 8, 0));
  });
});

describe('NotificationPause', () => {
  it('suppresses new mail and automation notifications until the hour is over', async () => {
    const { time, hub, center, pause, changes } = setup();
    pause.pause('hour');
    hub.publish(upserted(thread('paused', '2026-11-15T08:01:00.000Z')));
    hub.publish(automationNotified('Počas pauzy'));
    await time.advance(0);
    expect(center.shown).toEqual([]);
    expect(pause.state()).toEqual({
      kind: 'paused',
      until: new Date('2026-11-15T09:00:00.000Z'),
    });

    await time.advance(HOUR_MS);
    hub.publish(upserted(thread('after', '2026-11-15T09:01:00.000Z')));
    hub.publish(automationNotified('Po pauze'));
    await time.advance(0);

    expect(center.shown).toEqual(['Tibor: Po pauze', 'Jana Nováková: Predmet after']);
    expect(changes).toEqual([
      { kind: 'paused', until: new Date('2026-11-15T09:00:00.000Z') },
      { kind: 'active' },
    ]);
  });

  it('stays paused until the user resumes notifications', async () => {
    const { time, hub, center, pause, changes } = setup();
    pause.pause('indefinite');
    await time.advance(7 * 24 * HOUR_MS);
    hub.publish(automationNotified('Stále ticho'));
    expect(pause.isPaused()).toBe(true);
    expect(time.pendingCount).toBe(0);

    pause.resume();
    hub.publish(automationNotified('Znova'));

    expect(center.shown).toEqual(['Tibor: Znova']);
    expect(changes).toEqual([{ kind: 'paused', until: null }, { kind: 'active' }]);
  });

  it('treats an overdue pause as over even before its timer fires', () => {
    let current = Date.parse('2026-11-15T08:00:00.000Z');
    const clock = { now: () => new Date(current) };
    const pause = new NotificationPause(clock, { after: () => ({ cancel: () => undefined }) });
    pause.pause('hour');
    expect(pause.isPaused()).toBe(true);
    current += HOUR_MS;
    expect(pause.isPaused()).toBe(false);
    expect(pause.state()).toEqual({ kind: 'active' });
  });

  it('replaces the previous pause and its expiry when paused again', async () => {
    const { time, pause, changes } = setup();
    pause.pause('hour');
    pause.pause('indefinite');
    expect(time.pendingCount).toBe(0);
    await time.advance(2 * HOUR_MS);
    expect(pause.isPaused()).toBe(true);
    pause.resume();
    pause.resume();
    expect(changes.map((state) => state.kind)).toEqual(['paused', 'paused', 'active']);
  });
});
