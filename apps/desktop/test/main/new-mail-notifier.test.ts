import { type NotificationMode, ThreadIdSchema } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import { describe, expect, it } from 'vitest';
import { EventHub } from '../../src/main/events/event-hub';
import { type MailNotification, NewMailNotifier } from '../../src/main/native/new-mail-notifier';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { inSplit, thread, upserted } from './support/thread-events';

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

  it('notifies only about new mail in the main tab in urgent mode', async () => {
    const { time, hub, shown } = setup('urgent');
    hub.publish(upserted(inSplit(thread('newsletter', '2026-11-15T08:01:00.000Z'))));
    hub.publish(upserted(thread('important', '2026-11-15T08:02:00.000Z')));
    await time.advance(0);
    expect(shown.map((notification) => notification.threadId)).toEqual([
      ThreadIdSchema.parse('important'),
    ]);
  });

  it('keeps tracking split threads so they stay quiet after leaving the split', async () => {
    const { time, hub, shown } = setup('urgent');
    const arrived = thread('moved', '2026-11-15T08:01:00.000Z');
    hub.publish(upserted(inSplit(arrived)));
    hub.publish(upserted(arrived));
    await time.advance(0);
    expect(shown).toEqual([]);
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

  it('counts only main tab threads in the digest', async () => {
    const { time, hub, shown, notifier } = setup('digest');
    hub.publish(upserted(thread('a', '2026-11-15T08:01:00.000Z')));
    hub.publish(upserted(inSplit(thread('b', '2026-11-15T08:01:00.000Z'))));
    hub.publish(upserted(inSplit(thread('c', '2026-11-15T08:01:00.000Z'))));
    await time.advance(60_000);
    expect(shown).toEqual([{ title: 'Relay', body: 'Máš 1 novú správu', threadId: null }]);
    notifier.stop();
  });

  it('drops a thread from the pending digest once it moves into a split', async () => {
    const { time, hub, shown, notifier } = setup('digest');
    const moved = thread('a', '2026-11-15T08:01:00.000Z');
    hub.publish(upserted(moved));
    hub.publish(upserted(thread('b', '2026-11-15T08:01:00.000Z')));
    await time.advance(0);
    hub.publish(upserted(inSplit(moved)));
    await time.advance(60_000);
    expect(shown).toEqual([{ title: 'Relay', body: 'Máš 1 novú správu', threadId: null }]);
    notifier.stop();
  });

  it('shows no digest when only split threads arrived', async () => {
    const { time, hub, shown, notifier } = setup('digest');
    hub.publish(upserted(inSplit(thread('a', '2026-11-15T08:01:00.000Z'))));
    await time.advance(120_000);
    expect(shown).toEqual([]);
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
