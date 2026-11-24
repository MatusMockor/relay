import { appendFileSync } from 'node:fs';
import type { MergeReport } from '@relay/engine';
import { MessageIdSchema, type ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { LOCAL_USER_ID } from '../src';
import { QueuedExecutor } from '../src/executor/queued-executor';
import { SqliteMessageMerges } from '../src/repositories/merges/sqlite-message-merges';
import {
  checkpoint,
  dbSize,
  maxRssMb,
  medianOf,
  percentile,
  queryTimes,
  refreshProxyMs,
  heapMb,
  rssMb,
} from './support/copy-merge-probes';
import { seedGmailDuplicates } from './support/gmail-duplicates-seed';
import { expectMergeInvariants } from './support/merge-invariants';
import { seedMergeAccount } from './support/merge-seed';
import { messageCount } from './support/place-fixtures';
import { createTempDirectory, createTestStore, tempDatabasePath } from './support/test-database';

const CHUNK_MESSAGES = 500;
const SIZES =
  process.env.RELAY_PERF_SIZE === undefined
    ? [500, 10_000, 100_000]
    : [Number(process.env.RELAY_PERF_SIZE)];

const report = (result: Record<string, unknown>, row: string): void => {
  const line = `${JSON.stringify(result)}\n${row}\n`;
  process.stdout.write(line);
  const out = process.env.RELAY_PERF_OUT;
  if (out !== undefined) {
    appendFileSync(out, line);
  }
};

describe.runIf(process.env.RELAY_PERF === '1')('copy merge performance (SQLite)', () => {
  it.each(SIZES)(
    'merges the duplicates of %i logical mails',
    async (size) => {
      const directory = createTempDirectory();
      const path = tempDatabasePath(directory);
      const store = createTestStore(path);
      const account = await seedMergeAccount(store);
      const accountId = account.seeded.account.id;
      const seedStarted = performance.now();
      const fixture = seedGmailDuplicates(store, account, size);
      const seedMs = performance.now() - seedStarted;
      checkpoint(store);
      const sizeBefore = dbSize(store, path);
      const before = await queryTimes(store, fixture.duplicateThreads);
      const steps = new Map<string, number>();
      const merges = new SqliteMessageMerges(new QueuedExecutor(store.database), (step, ms) => {
        steps.set(step, (steps.get(step) ?? 0) + ms);
      });
      const chunkMs: number[] = [];
      const keysetMs: number[] = [];
      const refreshMs: number[] = [];
      const threadsPerChunk: number[] = [];
      const chunkThreads: ThreadId[][] = [];
      const rssSamples: number[] = [rssMb()];
      const heapSamples: number[] = [heapMb()];
      const maxRssBefore = maxRssMb();
      const loserIds: string[] = [];
      const skipped = { 'spans-threads': 0, 'mailbox-conflict': 0 };
      let after: string | null = null;
      const mergeStarted = performance.now();
      for (;;) {
        const keysetStarted = performance.now();
        const chunk = await merges.nextGroups(accountId, after, CHUNK_MESSAGES);
        keysetMs.push(performance.now() - keysetStarted);
        if (chunk.groups.length === 0) {
          break;
        }
        const chunkStarted = performance.now();
        const merged: MergeReport = await store.unitOfWork.run(() =>
          merges.merge(accountId, chunk.groups),
        );
        chunkMs.push(performance.now() - chunkStarted);
        rssSamples.push(rssMb());
        heapSamples.push(heapMb());
        skipped['spans-threads'] += merged.skipped['spans-threads'];
        skipped['mailbox-conflict'] += merged.skipped['mailbox-conflict'];
        loserIds.push(...merged.merged.flatMap((group) => group.loserIds));
        const threadIds = [...new Set(merged.merged.map((group) => group.threadId))];
        threadsPerChunk.push(threadIds.length);
        chunkThreads.push(threadIds);
        after = chunk.last;
      }
      const mergeMs = performance.now() - mergeStarted;
      const maxRssAfter = maxRssMb();
      for (const threadIds of chunkThreads) {
        refreshMs.push(await refreshProxyMs(store, threadIds));
      }
      const sizeAfterRaw = dbSize(store, path);
      checkpoint(store);
      const sizeAfter = dbSize(store, path);
      const afterQueries = await queryTimes(store, fixture.duplicateThreads);
      const aliasMs = await medianOf(async () => {
        for (const loserId of loserIds.slice(0, 200)) {
          await store.repositories.messages.findById(LOCAL_USER_ID, MessageIdSchema.parse(loserId));
        }
      });
      store.database.sqlite.exec('VACUUM');
      checkpoint(store);
      const sizeVacuum = dbSize(store, path);
      const remaining = await merges.nextGroups(accountId, null, 1_000_000);
      const chunkTotal = chunkMs.reduce((total, ms) => total + ms, 0);
      const jsonShare = ((steps.get('json') ?? 0) / chunkTotal) * 100;
      const result = {
        store: 'sqlite',
        mails: size,
        rows: fixture.rows,
        groups: fixture.groups,
        mergedLosers: loserIds.length,
        skipped,
        seedMs: Math.round(seedMs),
        chunks: chunkMs.length,
        mergeMs: Math.round(mergeMs),
        chunkMsTotal: Math.round(chunkTotal),
        messagesPerSecond: Math.round(((loserIds.length + fixture.groups) / chunkTotal) * 1000),
        chunkP50: percentile(chunkMs, 0.5),
        chunkP95: percentile(chunkMs, 0.95),
        chunkMax: percentile(chunkMs, 1),
        keysetP95: percentile(keysetMs, 0.95),
        steps: Object.fromEntries([...steps].map(([step, ms]) => [step, Math.round(ms)])),
        jsonSharePercent: Number(jsonShare.toFixed(1)),
        refreshMsTotal: Math.round(refreshMs.reduce((total, ms) => total + ms, 0)),
        refreshP95: percentile(refreshMs, 0.95),
        threadsPerChunkMax: Math.max(0, ...threadsPerChunk),
        threadsTouched: threadsPerChunk.reduce((total, count) => total + count, 0),
        rssFirstMb: rssSamples[0],
        rssSampleMaxMb: Math.max(...rssSamples),
        heapFirstMb: heapSamples[0],
        heapSampleMaxMb: Math.max(...heapSamples),
        maxRssBeforeMb: maxRssBefore,
        maxRssAfterMb: maxRssAfter,
        sizeBefore,
        sizeAfterRaw,
        sizeAfter,
        sizeVacuum,
        before,
        after: afterQueries,
        aliasLookup200Ms: aliasMs,
      };
      const db = (value: { fileMb: number; walMb: number }): string =>
        `${String(value.fileMb)}+${String(value.walMb)}`;
      report(
        result,
        `| ${String(size)} | ${String(fixture.rows)} | ${String(loserIds.length)} | ${String(skipped['spans-threads'])}/${String(skipped['mailbox-conflict'])} | ${String(chunkMs.length)} | ${(mergeMs / 1000).toFixed(1)} | ${String(result.chunkP50)}/${String(result.chunkP95)}/${String(result.chunkMax)} | ${String(result.jsonSharePercent)}% | ${(result.refreshMsTotal / 1000).toFixed(1)} (${String(result.refreshP95)}) | ${String(result.rssSampleMaxMb)} / ${String(maxRssBefore)}->${String(maxRssAfter)} | ${db(sizeBefore)} / ${db(sizeAfterRaw)} / ${db(sizeVacuum)} | ${String(before.inboxMs)}/${String(afterQueries.inboxMs)} | ${String(before.detailP50Ms)}/${String(afterQueries.detailP50Ms)} (p95 ${String(before.detailP95Ms)}/${String(afterQueries.detailP95Ms)}) |`,
      );
      expect(messageCount(store)).toBe(fixture.rows - loserIds.length);
      expect(remaining.groups).toHaveLength(skipped['spans-threads'] + skipped['mailbox-conflict']);
      expectMergeInvariants(store);
      store.database.close();
      directory.remove();
    },
    3_600_000,
  );
});
