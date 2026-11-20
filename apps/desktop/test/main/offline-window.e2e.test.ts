import { type MailAccount, type OfflineWindow, offlineWindowCutoff } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, type GreenMailAccount, withImap } from './support/greenmail';
import { seedMailbox } from './support/history-seed';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { ManualTime } from './support/manual-time';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const ARCHIVE = { path: 'Archive', count: 36, prefix: 'arch' };
const STEP_MS = 2_000;
const MAX_STEPS = 60;

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

interface Row {
  readonly id: string;
  readonly header: string;
  readonly state: string;
  readonly ts: number;
  readonly body: string | null;
}

describe('offline window on desktop (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let time: ManualTime;
  let harness: LocalRuntimeHarness;

  const archiveRows = (): Row[] =>
    harness.runtime.engine.database.sqlite
      .prepare(
        "select m.id as id, m.message_id_header as header, m.body_state as state, m.date_ts as ts, m.text_body as body from messages m join mailboxes b on b.id = m.mailbox_id where b.path = 'Archive'",
      )
      .all() as Row[];

  const cutoffOf = (window: OfflineWindow): number =>
    offlineWindowCutoff(window, new Date())?.getTime() ?? Number.NEGATIVE_INFINITY;

  const windowSettled = (window: OfflineWindow): boolean => {
    const rows = archiveRows();
    const cutoff = cutoffOf(window);
    return (
      rows.length === ARCHIVE.count &&
      rows.every((row) => row.ts >= cutoff === (row.state === 'local'))
    );
  };

  const stepUntil = async (done: () => boolean): Promise<number> => {
    for (let steps = 0; steps < MAX_STEPS; steps += 1) {
      if (done()) {
        return steps;
      }
      await time.advance(STEP_MS);
      await harness.runtime.background.history.idle();
      await harness.runtime.background.scheduler.idle();
    }
    return MAX_STEPS;
  };

  const expectWindow = (window: OfflineWindow): void => {
    const cutoff = cutoffOf(window);
    const rows = archiveRows();
    expect(rows).toHaveLength(ARCHIVE.count);
    rows
      .filter((row) => row.ts >= cutoff)
      .forEach((row) => {
        expect(row.state).toBe('local');
        expect(row.body).toContain('Obsah spravy');
      });
    rows
      .filter((row) => row.ts < cutoff)
      .forEach((row) => {
        expect(row).toMatchObject({ state: 'remote', body: null });
      });
  };

  const textOf = (row: Row): string =>
    `Obsah spravy ${row.header.replace(/^<arch-(\d+)@.*$/, '$1')} v Archive.`;

  const bodyOf = async (row: Row) =>
    expectOk(await harness.bridge.invoke('local.messages.body', { messageId: row.id }));

  const choose = async (window: OfflineWindow): Promise<void> => {
    const saved = expectOk(
      await harness.bridge.invoke('settings.device.set', { offlineWindow: window }),
    );
    expect(saved.offlineWindow).toBe(window);
    await harness.runtime.background.offlineWindow?.idle();
  };

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await withImap(mailbox, (client) => seedMailbox(client, mailbox.email, ARCHIVE));
    time = new ManualTime(new Date().toISOString());
    harness = startLocalRuntime(dir, { timers: time, historyCadence: { startDelayMs: 0 } });
  }, 60_000);

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('hydrates the default six months, evicts on a shorter window and hydrates a longer one', async () => {
    const account: MailAccount = await seedImapAccount(harness.runtime, mailbox);
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    await harness.runtime.background.start();

    expect(await stepUntil(() => windowSettled('6m'))).toBeLessThan(MAX_STEPS);
    expectWindow('6m');
    const inSixMonths = archiveRows().filter((row) => row.state === 'local').length;
    expect(inSixMonths).toBeGreaterThan(3);
    expect(expectOk(await harness.bridge.invoke('local.sync.offline'))).toEqual({
      local: inSixMonths,
      remote: ARCHIVE.count - inSixMonths,
    });

    const before = archiveRows();
    await choose('3m');

    expectWindow('3m');
    const evicted = archiveRows().filter(
      (row) =>
        row.state === 'remote' && before.some((old) => old.id === row.id && old.state === 'local'),
    );
    expect(evicted.length).toBeGreaterThan(0);
    for (const row of evicted) {
      const body = await bodyOf(row);
      expect(body).toMatchObject({ status: 'ok' });
      expect(body.status === 'ok' && body.textBody?.trim()).toBe(textOf(row));
    }
    expect(archiveRows().filter((row) => row.state === 'local').length).toBeLessThan(inSixMonths);
    expect(harness.events.some((event) => event.type === 'threads.changed')).toBe(true);

    await choose('1y');

    expect(await stepUntil(() => windowSettled('1y'))).toBeLessThan(MAX_STEPS);
    expectWindow('1y');
    const hydrated = archiveRows().filter(
      (row) =>
        row.state === 'local' && before.some((old) => old.id === row.id && old.state === 'remote'),
    );
    expect(hydrated.length).toBeGreaterThan(0);
    for (const row of [...hydrated, ...evicted]) {
      const body = await bodyOf(row);
      expect(body).toMatchObject({ status: 'local' });
      expect(body.status === 'local' && body.textBody?.trim()).toBe(textOf(row));
    }
    const stats = expectOk(await harness.bridge.invoke('local.sync.offline'));
    expect(stats.local).toBeGreaterThan(inSixMonths);
    expect(stats.local + stats.remote).toBe(ARCHIVE.count);
  }, 60_000);

  it('bounds a whole-text server search by the six month cutoff once the history is complete', async () => {
    const account: MailAccount = await seedImapAccount(harness.runtime, mailbox);
    expectOk(await harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    await harness.runtime.background.start();
    expect(await stepUntil(() => windowSettled('6m'))).toBeLessThan(MAX_STEPS);
    const progress = expectOk(await harness.bridge.invoke('local.sync.history'));
    expect(progress.map((entry) => entry.state)).toEqual(['done']);

    const response = expectOk(
      await harness.bridge.invoke('local.search.server', { requestId: 'obsah', q: 'Obsah' }),
    );

    const cutoff = cutoffOf('6m');
    const older = archiveRows().filter((row) => row.ts < cutoff);
    expect(response.status).toBe('ok');
    expect(response.hits.length).toBeGreaterThanOrEqual(older.length - 1);
    expect(response.hits.filter((hit) => Date.parse(hit.date) >= cutoff)).toEqual([]);
  }, 60_000);
});
