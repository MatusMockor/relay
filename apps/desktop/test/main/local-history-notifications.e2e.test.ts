import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemClock } from '../../src/main/infra/system-clock';
import { type MailNotification, NewMailNotifier } from '../../src/main/native/new-mail-notifier';
import { systemTimers } from '../../src/main/platform/timers';
import { createGreenMailAccount, type GreenMailAccount, withImap } from './support/greenmail';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { createTestLogger } from './support/memory-log-sink';
import { imapAccountBody } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';
import { upserted } from './support/thread-events';

const DAY_MS = 86_400_000;

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

const futureDatedMail = (to: string, date: Date): Buffer =>
  Buffer.from(
    [
      'From: Archiv <archiv@firma.test>',
      `To: ${to}`,
      'Subject: Stara sprava z buducnosti',
      'Message-ID: <history-future-1@firma.test>',
      `Date: ${date.toUTCString()}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Stary obsah.',
    ].join('\r\n'),
  );

const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

describe('local history backfill and new mail notifications (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await withImap(mailbox, async (client) => {
      const header = new Date(Date.now() + 2 * DAY_MS);
      const arrived = new Date(Date.now() - 2 * 365 * DAY_MS);
      await client.append('INBOX', futureDatedMail(mailbox.email, header), [], arrived);
    });
    harness = startLocalRuntime(dir);
  });

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('never notifies about an unread future-dated inbox message ingested by history', async () => {
    const { bridge, runtime } = harness;
    const account = expectOk(
      await bridge.invoke('local.accounts.create', imapAccountBody(mailbox)),
    );
    expectOk(await bridge.invoke('local.sync.now', { accountId: account.id }));
    expect(expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' })).items).toEqual(
      [],
    );
    const shown: MailNotification[] = [];
    const notifier = new NewMailNotifier({
      hub: runtime.infrastructure.hub,
      presenter: { show: (notification) => shown.push(notification) },
      mode: () => Promise.resolve('urgent'),
      clock: systemClock,
      timers: systemTimers,
      logger: createTestLogger().logger,
    });
    notifier.start();

    const report = await runtime.engine.services.sync.backfillHistory(LOCAL_USER_ID, account.id);
    await settle();

    expect(report).toMatchObject({ skipped: false, processed: 1 });
    const [thread] = expectOk(await bridge.invoke('local.threads.list', { view: 'inbox' })).items;
    expect(thread).toMatchObject({ unread: true, state: 'inbox', splitIds: [] });
    expect(Date.parse(thread?.lastMessageAt ?? '')).toBeGreaterThan(Date.now());
    expect(shown).toEqual([]);
    expect(harness.events.map((event) => event.type)).toContain('threads.changed');

    if (thread !== undefined) {
      runtime.infrastructure.hub.publish(upserted(thread));
    }
    await settle();
    expect(shown).toHaveLength(1);
    notifier.stop();
  });
});
