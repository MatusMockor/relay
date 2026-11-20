import { monitorEventLoopDelay } from 'node:perf_hooks';
import { LOCAL_USER_ID } from '@relay/store-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGreenMailAccount, type GreenMailAccount, withImap } from './support/greenmail';
import { seedMailbox } from './support/history-seed';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { seedImapAccount } from './support/seed-account';
import { timeProviders } from './support/timed-provider-factory';
import { createTempDir, type TempDir } from './support/temp-dir';

const MESSAGES = 5_000;
const NS_PER_MS = 1e6;
const MAX_ROUNDS = 100;

const storedLocations = ({ runtime }: LocalRuntimeHarness): string[] =>
  (
    runtime.engine.database.sqlite
      .prepare(
        "select b.path || ':' || m.uid as location from messages m join mailboxes b on b.id = m.mailbox_id where b.path = 'Archive'",
      )
      .all() as { location: string }[]
  ).map((row) => row.location);

describe.skipIf(process.env.RELAY_PERF !== '1')('history backfill throughput (GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let harness: LocalRuntimeHarness;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await withImap(mailbox, (client) =>
      seedMailbox(client, mailbox.email, {
        path: 'Archive',
        count: MESSAGES,
        prefix: 'perf',
        chains: true,
      }),
    );
    harness = startLocalRuntime(dir);
  }, 300_000);

  afterEach(async () => {
    await harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('ingests header-only history fast enough without blocking the event loop', async () => {
    const { runtime } = harness;
    const account = await seedImapAccount(runtime, mailbox);
    await runtime.engine.services.sync.syncAccount(LOCAL_USER_ID, account.id);
    const initial = storedLocations(harness);
    const timing = timeProviders(runtime.engine.mail.mailProviderFactory);
    const delay = monitorEventLoopDelay({ resolution: 10 });
    let processed = 0;
    let slices = 0;
    let completed = false;
    const started = performance.now();
    delay.enable();
    for (let round = 0; round < MAX_ROUNDS && !completed; round += 1) {
      const report = await runtime.engine.services.sync.backfillHistory(LOCAL_USER_ID, account.id);
      if (report.skipped) {
        continue;
      }
      processed += report.processed;
      slices += 1;
      completed = !report.more;
    }
    delay.disable();
    const seconds = (performance.now() - started) / 1_000;
    const rate = processed / seconds;
    const localSeconds = seconds - timing.totalMs / 1_000;
    const localRate = processed / localSeconds;
    const p50 = delay.percentile(50) / NS_PER_MS;
    const p99 = delay.percentile(99) / NS_PER_MS;
    const max = delay.max / NS_PER_MS;
    console.info(
      `history perf: ${String(processed)} messages in ${seconds.toFixed(1)} s over ${String(slices)} slices = ${rate.toFixed(0)} msg/s end to end, ${(timing.totalMs / 1_000).toFixed(1)} s in IMAP, local processing ${localRate.toFixed(0)} msg/s; event loop delay p50 ${p50.toFixed(1)} ms, p99 ${p99.toFixed(1)} ms, max ${max.toFixed(1)} ms`,
    );

    expect(completed).toBe(true);
    const progress = await harness.bridge.invoke('local.sync.history');
    expect(progress).toMatchObject({ ok: true, data: [{ accountId: account.id, state: 'done' }] });
    const stored = storedLocations(harness);
    expect(initial.length).toBeGreaterThan(0);
    expect(new Set(stored).size).toBe(MESSAGES);
    expect(stored).toEqual(expect.arrayContaining(initial));
    expect(processed).toBeGreaterThan(MESSAGES - 300);
    expect(localRate).toBeGreaterThanOrEqual(150);
    expect(rate).toBeGreaterThanOrEqual(40);
    expect(p99).toBeLessThan(100);
  }, 600_000);
});
