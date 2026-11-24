import { appendFileSync } from 'node:fs';
import type { MergedGroup } from '@relay/engine';
import type { MailboxId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it, onTestFinished } from 'vitest';
import type { ServerRepositories } from '../../src/core/ports/server-unit-of-work';
import { openPostgresConnection } from '../../src/persistence/database/postgres-connection';
import { createPgRepositories } from '../../src/persistence/repositories/create-pg-repositories';
import { PgUnitOfWork } from '../../src/persistence/unit-of-work/pg-unit-of-work';
import { buildMailbox, mailboxByRole, seedAccount } from './support/fixtures';
import { aliasLookup, measureQueries, threadRefreshProxy } from './support/perf/copy-merge-queries';
import { seedDuplicateReferences } from './support/perf/gmail-duplicates-references';
import {
  type DuplicateFixture,
  emailIdOfUid,
  seedGmailDuplicates,
} from './support/perf/gmail-duplicates-seed';
import {
  MEASURED_TABLES,
  relationSizes,
  sampleContainerMemory,
  tempBytes,
  totalMib,
} from './support/perf/perf-probes';
import { mib, spreadOf, timed } from './support/perf/perf-stats';
import { openTimedDatabase } from './support/perf/timed-database';
import { createTestDatabase } from './support/test-database';

const SIZES = (process.env.RELAY_PERF_SIZE ?? '500,10000,100000').split(',').map(Number);
const CHUNK_MESSAGES = 500;
const RESOLVE_BATCH = 1_000;
const CONTAINER = 'relay-test-postgres-1';

const fixtureOf = async (repositories: ServerRepositories, size: number) => {
  const seeded = await seedAccount(repositories);
  const accountId = seeded.account.id;
  const stored = await repositories.mailboxes.upsertMany(accountId, [
    buildMailbox(accountId, 'archive', { name: 'All Mail', path: '[Gmail]/All Mail' }),
    buildMailbox(accountId, 'label', { name: 'Work', path: 'Work' }),
  ]);
  const fixture: DuplicateFixture = {
    size,
    userId: seeded.user.id,
    accountId,
    inbox: seeded.mailboxes.inbox.id,
    sent: seeded.mailboxes.sent.id,
    allMail: mailboxByRole(stored, 'archive').id,
    work: mailboxByRole(stored, 'label').id,
  };
  return fixture;
};

const resolveAll = async (repositories: ServerRepositories, fixture: DuplicateFixture) => {
  let resolved = 0;
  const mailboxes: MailboxId[] = [fixture.inbox, fixture.allMail, fixture.sent, fixture.work];
  for (const mailboxId of mailboxes) {
    let afterUid = 0;
    for (;;) {
      const batch = await repositories.emailIdResolutions.listUnresolved(
        mailboxId,
        afterUid,
        RESOLVE_BATCH,
      );
      if (batch.length === 0) {
        break;
      }
      resolved += await repositories.emailIdResolutions.fillEmailIds(
        mailboxId,
        batch.map(({ uid }) => ({ uid, emailId: emailIdOfUid(uid) })),
      );
      afterUid = batch.at(-1)?.uid ?? afterUid;
    }
  }
  return resolved;
};

const countOf = async (client: pg.Client, query: string, values: unknown[]): Promise<number> => {
  const { rows } = await client.query<{ count: number }>(query, values);
  return rows[0]?.count ?? 0;
};

const updateOnce = async (client: pg.Client, accountId: string, column: string) => {
  await client.query('BEGIN');
  const started = performance.now();
  await client.query(
    `UPDATE messages SET ${column} = ${column} WHERE id IN (SELECT id FROM messages WHERE account_id = $1 ORDER BY id LIMIT 5000)`,
    [accountId],
  );
  const ms = performance.now() - started;
  await client.query('ROLLBACK');
  return ms;
};

const updateProbe = async (client: pg.Client, accountId: string, column: string) => {
  await updateOnce(client, accountId, column);
  return Math.round(await updateOnce(client, accountId, column));
};

describe.runIf(process.env.RELAY_PERF === '1')('copy merge performance (Postgres)', () => {
  it.each(SIZES)(
    'merges %i logical Gmail mails stored as legacy copies',
    async (size) => {
      const database = await createTestDatabase();
      const connection = openPostgresConnection({ url: database.url, maxConnections: 4 });
      const client = new pg.Client({ connectionString: database.url });
      await client.connect();
      onTestFinished(async () => {
        await client.end();
        await connection.close();
        await database.drop();
      });
      const repositories = createPgRepositories(connection.db);
      const fixture = await fixtureOf(repositories, size);
      const seed = await timed(async () => {
        await seedGmailDuplicates(connection.db, fixture);
        await seedDuplicateReferences(connection.db, fixture);
      });
      const accountRows = 'SELECT count(*)::int AS count FROM messages WHERE account_id = $1';
      const rowsBefore = await countOf(client, accountRows, [fixture.accountId]);
      const sizesBefore = await relationSizes(connection.db);
      const queriesBefore = await measureQueries(connection.db, repositories, fixture);

      const resolution = await timed(() => resolveAll(repositories, fixture));

      const timedDb = openTimedDatabase(database.url);
      onTestFinished(() => timedDb.close());
      const unitOfWork = new PgUnitOfWork(timedDb.db);
      const tempBefore = await tempBytes(connection.db);
      const rssBefore = process.resourceUsage().maxRSS;
      const sampler = await sampleContainerMemory(CONTAINER);
      const chunkMs: number[] = [];
      const nextMs: number[] = [];
      const threadsPerChunk: number[] = [];
      const merged: MergedGroup[] = [];
      const skipped = { 'spans-threads': 0, 'mailbox-conflict': 0 };
      let heapPeak = 0;
      let after: string | null = null;
      const merge = await timed(async () => {
        for (;;) {
          const next = await timed(() =>
            repositories.messageMerges.nextGroups(fixture.accountId, after, CHUNK_MESSAGES),
          );
          nextMs.push(next.ms);
          if (next.result.groups.length === 0) {
            return;
          }
          const groups = next.result.groups;
          const chunk = await timed(() =>
            unitOfWork.run((repos) => repos.messageMerges.merge(fixture.accountId, groups)),
          );
          chunkMs.push(chunk.ms);
          merged.push(...chunk.result.merged);
          skipped['spans-threads'] += chunk.result.skipped['spans-threads'];
          skipped['mailbox-conflict'] += chunk.result.skipped['mailbox-conflict'];
          threadsPerChunk.push(new Set(chunk.result.merged.map((group) => group.threadId)).size);
          heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed);
          after = next.result.last;
        }
      });
      const container = await sampler.stop();
      const rssAfter = process.resourceUsage().maxRSS;
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      const tempAfter = await tempBytes(connection.db);

      const mergedThreads = [...new Set(merged.map((group) => group.threadId))];
      const refresh = await threadRefreshProxy(
        repositories,
        fixture,
        mergedThreads.slice(0, 2_000),
      );
      const sizesAfter = await relationSizes(connection.db);
      const queriesAfter = await measureQueries(connection.db, repositories, fixture);
      const alias = await aliasLookup(
        repositories,
        fixture,
        merged.flatMap((group) => group.loserIds),
      );
      const probe = {
        gateUpdateMs: await updateProbe(client, fixture.accountId, 'jira_effects_at'),
        flagUpdateMs: await updateProbe(client, fixture.accountId, 'seen'),
        bodyUpdateMs: await updateProbe(client, fixture.accountId, 'text_body'),
      };
      await client.query(`VACUUM (ANALYZE) ${MEASURED_TABLES.join(', ')}`);
      const sizesVacuum = await relationSizes(connection.db);
      await client.query(`VACUUM FULL ${MEASURED_TABLES.join(', ')}`);
      const sizesFull = await relationSizes(connection.db);
      const rowsAfter = await countOf(client, accountRows, [fixture.accountId]);
      const remaining = await repositories.messageMerges.nextGroups(
        fixture.accountId,
        null,
        100_000,
      );

      const losers = merged.reduce((sum, group) => sum + group.loserIds.length, 0);
      const steps = Object.fromEntries(
        [...timedDb.timings].map(([step, entry]) => [step, Math.round(entry.ms)]),
      );
      const report = {
        size,
        rowsBefore,
        rowsAfter,
        groupsMerged: merged.length,
        skipped,
        seedMs: Math.round(seed.ms),
        resolution: { resolved: resolution.result, ms: Math.round(resolution.ms) },
        merge: {
          totalMs: Math.round(merge.ms),
          chunks: chunkMs.length,
          messagesPerSecond: Math.round(((losers + merged.length) / merge.ms) * 1000),
          chunk: spreadOf(chunkMs),
          nextGroups: spreadOf(nextMs),
          threadsPerChunk: spreadOf(threadsPerChunk),
          steps,
        },
        memory: {
          nodeMaxRssDeltaMib: mib((rssAfter - rssBefore) * 1024),
          nodeMaxRssMib: mib(rssAfter * 1024),
          nodeHeapPeakMib: mib(heapPeak),
          container,
          tempMib: mib(tempAfter - tempBefore),
        },
        threadRefreshPerThread: refresh,
        threadRefreshEstimateMs: Math.round(refresh.p50 * mergedThreads.length),
        mergedThreads: mergedThreads.length,
        sizes: {
          beforeMib: totalMib(sizesBefore),
          afterMib: totalMib(sizesAfter),
          vacuumMib: totalMib(sizesVacuum),
          vacuumFullMib: totalMib(sizesFull),
          before: sizesBefore,
          after: sizesAfter,
          vacuumFull: sizesFull,
        },
        queries: { before: queriesBefore, after: queriesAfter, aliasFindById: alias },
        updateProbe5k: probe,
      };
      console.log(`COPY_MERGE_PERF ${JSON.stringify(report)}`);
      if (process.env.RELAY_PERF_OUT !== undefined) {
        appendFileSync(process.env.RELAY_PERF_OUT, `${JSON.stringify(report)}\n`);
      }

      expect(rowsAfter).toBe(rowsBefore - losers);
      expect(remaining.groups).toHaveLength(skipped['spans-threads'] + skipped['mailbox-conflict']);
      expect(merge.ms).toBeLessThan(900_000);
      await expect(
        connection.db.execute(sql`select 1 from messages m where m.account_id = ${fixture.accountId}
          and not exists (select 1 from message_placements mp where mp.message_id = m.id) limit 1`),
      ).resolves.toMatchObject({ rows: [] });
    },
    3_600_000,
  );
});
