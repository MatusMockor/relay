import type { HistoryProgress, MailAccount } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AesTestCipher } from './support/aes-test-cipher';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
  withImap,
} from './support/greenmail';
import { type SeedSpec, seedMailbox } from './support/history-seed';
import { type LocalRuntimeHarness, startLocalRuntime } from './support/local-runtime-harness';
import { ManualTime } from './support/manual-time';
import { seedImapAccount } from './support/seed-account';
import { createTempDir, type TempDir } from './support/temp-dir';

const DAY_MS = 86_400_000;
const SEED: readonly SeedSpec[] = [
  { path: 'INBOX', count: 300, prefix: 'inbox' },
  { path: 'Archive', count: 2_500, prefix: 'arch', chains: true },
  { path: 'Projekty', count: 200, prefix: 'proj' },
];
const TOTAL = SEED.reduce((sum, spec) => sum + spec.count, 0);
const STEP_MS = 2_000;
const RECHECK_MS = 15 * 60_000;

const expectOk = <T>(result: { ok: true; data: T } | { ok: false; error: unknown }): T => {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
};

interface Rig {
  readonly time: ManualTime;
  readonly harness: LocalRuntimeHarness;
}

const cipher = new AesTestCipher();

const startRig = (dir: TempDir): Rig => {
  const time = new ManualTime(new Date().toISOString());
  const harness = startLocalRuntime(dir, {
    timers: time,
    cipher,
    historyCadence: { startDelayMs: 0 },
  });
  return { time, harness };
};

const progressOf = async ({ harness }: Rig): Promise<HistoryProgress> => {
  const [progress] = expectOk(await harness.bridge.invoke('local.sync.history'));
  expect(progress).toBeDefined();
  return progress as HistoryProgress;
};

const step = async (rig: Rig, ms = STEP_MS): Promise<void> => {
  await rig.time.advance(ms);
  await rig.harness.runtime.background.history.idle();
  await rig.harness.runtime.background.scheduler.idle();
};

const REAL_DEADLINE_MS = 120_000;

const realPause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runToDone = async (rig: Rig, limit = 5_000): Promise<HistoryProgress[]> => {
  const seen: HistoryProgress[] = [];
  const deadline = Date.now() + REAL_DEADLINE_MS;
  for (let round = 0; round < limit && Date.now() < deadline; round += 1) {
    await step(rig);
    await realPause(20);
    const progress = await progressOf(rig);
    seen.push(progress);
    if (progress.state === 'done') {
      return seen;
    }
  }
  return seen;
};

const rows = <Row>({ harness }: Rig, sql: string, ...params: unknown[]): Row[] =>
  harness.runtime.engine.database.sqlite.prepare(sql).all(...params) as Row[];

const countsByPath = (rig: Rig): Record<string, number> =>
  Object.fromEntries(
    rows<{ path: string; n: number }>(
      rig,
      'select b.path as path, count(*) as n from messages m join mailboxes b on b.id = m.mailbox_id group by b.path',
    ).map((row) => [row.path, row.n]),
  );

const scalar = (rig: Rig, sql: string, ...params: unknown[]): number =>
  rows<{ n: number }>(rig, sql, ...params)[0]?.n ?? -1;

const seededServer = async (mailbox: GreenMailAccount): Promise<void> => {
  await withImap(mailbox, async (client) => {
    for (const spec of SEED) {
      await seedMailbox(client, mailbox.email, spec);
    }
  });
};

const locations = (rig: Rig): Set<string> =>
  new Set(
    rows<{ location: string }>(
      rig,
      "select mailbox_id || ':' || uid as location from messages",
    ).map((row) => row.location),
  );

const connect = async (rig: Rig, mailbox: GreenMailAccount) => {
  const account: MailAccount = await seedImapAccount(rig.harness.runtime, mailbox);
  expectOk(await rig.harness.bridge.invoke('local.sync.now', { accountId: account.id }));
  const initial = locations(rig);
  await rig.harness.runtime.background.start();
  return { account, initial };
};

describe('history backfill on desktop (SQLite + GreenMail)', () => {
  let dir: TempDir;
  let mailbox: GreenMailAccount;
  let rig: Rig;

  beforeEach(async () => {
    dir = await createTempDir();
    mailbox = await createGreenMailAccount();
    await seededServer(mailbox);
    rig = startRig(dir);
  }, 120_000);

  afterEach(async () => {
    await rig.harness.close();
    await mailbox.remove();
    await dir.remove();
  });

  it('downloads the whole history quietly while new mail still arrives first', async () => {
    const { account, initial } = await connect(rig, mailbox);
    const tasksBefore = scalar(rig, 'select count(*) as n from tasks');
    const aiJobsBefore = scalar(rig, 'select count(*) as n from ai_jobs');
    const historyAiJobs =
      "select count(*) as n from ai_jobs where thread_id is null or thread_id not in (select thread_id from messages where subject = 'Nová počas histórie')";
    rig.harness.events.length = 0;
    const first = await runToDone(rig, 1);
    expect(first.at(-1)?.state).toBe('running');

    await rig.time.advance(STEP_MS);
    await deliverMail(mailbox, {
      from: 'Eva <eva@firma.test>',
      subject: 'Nová počas histórie',
      text: 'Ahoj',
    });
    expectOk(await rig.harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    const inbox = expectOk(
      await rig.harness.bridge.invoke('local.threads.list', { view: 'inbox' }),
    );
    expect(inbox.items.map((thread) => thread.subject)).toContain('Nová počas histórie');
    await rig.harness.runtime.background.history.idle();

    const seen = [...first, ...(await runToDone(rig))];

    const stored = seen.map((progress) => progress.stored);
    expect(stored).toEqual([...stored].sort((left, right) => left - right));
    expect(seen.at(-1)).toEqual({
      accountId: account.id,
      stored: TOTAL + 1,
      total: TOTAL + 1,
      state: 'done',
    });
    expect(countsByPath(rig)).toEqual({ INBOX: 301, Archive: 2_500, Projekty: 200 });
    const states = rows<{ location: string; state: string; ts: number }>(
      rig,
      "select mailbox_id || ':' || uid as location, body_state as state, date_ts as ts from messages",
    );
    const history = states.filter((row) => !initial.has(row.location));
    expect(history.length).toBeGreaterThan(2_500);
    expect(history.filter((row) => row.state !== 'remote')).toEqual([
      expect.objectContaining({ state: 'local' }),
    ]);
    expect(states.filter((row) => initial.has(row.location) && row.state !== 'local')).toEqual([]);
    expect(history.every((row) => row.ts < Date.now() - 29 * DAY_MS || row.state === 'local')).toBe(
      true,
    );

    const threadOf = new Map(
      rows<{ id: string; thread: string }>(
        rig,
        "select m.message_id_header as id, m.thread_id as thread from messages m join mailboxes b on b.id = m.mailbox_id where b.path = 'Archive'",
      ).map((row) => [row.id, row.thread]),
    );
    const chainThreads = new Set<string | undefined>();
    const split: number[] = [];
    for (let root = 0; root + 2 < 2_500; root += 3) {
      const thread = threadOf.get(`<arch-${String(root)}@hist.test>`);
      const replies = [root + 1, root + 2].map((index) =>
        threadOf.get(`<arch-${String(index)}@hist.test>`),
      );
      if (replies.some((reply) => reply !== thread)) {
        split.push(root);
      }
      chainThreads.add(thread);
    }
    expect(split).toEqual([]);
    expect(chainThreads.size).toBe(833);

    expect(scalar(rig, 'select count(*) as n from tasks')).toBe(tasksBefore);
    expect(scalar(rig, historyAiJobs)).toBe(aiJobsBefore);
    const types = new Set(rig.harness.events.map((event) => event.type));
    expect(types.has('automation.notified')).toBe(false);
    expect(types.has('task.upserted')).toBe(false);
    expect(types.has('sync.history')).toBe(true);
    const upserted = rig.harness.events.flatMap((event) =>
      event.type === 'thread.upserted' ? [event.data.thread.subject] : [],
    );
    expect(new Set(upserted)).toEqual(new Set(['Nová počas histórie']));
  }, 240_000);

  it('resumes after a restart without duplicates and restarts a recreated folder', async () => {
    const { account } = await connect(rig, mailbox);
    const partial = await runToDone(rig, 2);
    expect(partial.at(-1)?.state).toBe('running');
    await rig.harness.close();

    rig = startRig(dir);
    await rig.harness.runtime.background.start();
    const resumed = await runToDone(rig);
    expect(resumed.at(-1)?.state).toBe('done');
    expect(countsByPath(rig)).toEqual({ INBOX: 300, Archive: 2_500, Projekty: 200 });
    expect(
      rows(
        rig,
        'select mailbox_id, message_id_header, count(*) as n from messages group by 1, 2 having n > 1',
      ),
    ).toEqual([]);

    await withImap(mailbox, async (client) => {
      await client.mailboxDelete('Projekty');
      await seedMailbox(client, mailbox.email, { path: 'Projekty', count: 200, prefix: 'proj2' });
    });
    expectOk(await rig.harness.bridge.invoke('local.sync.now', { accountId: account.id }));
    expect((await progressOf(rig)).state).toBe('running');
    await step(rig, RECHECK_MS);
    const restarted = await runToDone(rig);

    expect(restarted.at(-1)).toMatchObject({ stored: TOTAL, total: TOTAL, state: 'done' });
    const projects = rows<{ id: string }>(
      rig,
      "select m.message_id_header as id from messages m join mailboxes b on b.id = m.mailbox_id where b.path = 'Projekty'",
    ).map((row) => row.id);
    expect(projects).toHaveLength(200);
    expect(projects.every((id) => id.startsWith('<proj2-'))).toBe(true);
  }, 240_000);
});
