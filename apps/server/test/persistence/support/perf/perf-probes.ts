import { spawn } from 'node:child_process';
import { sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../../src/persistence/database/database';
import { mib } from './perf-stats';

export const MEASURED_TABLES = [
  'messages',
  'message_placements',
  'message_labels',
  'message_aliases',
];

export interface RelationSize extends Record<string, unknown> {
  readonly relation: string;
  readonly totalMib: number;
  readonly indexesMib: number;
  readonly searchIndexMib: number | null;
  readonly deadTuples: number;
}

export const relationSizes = async (db: DbExecutor): Promise<RelationSize[]> => {
  await db.execute(sql`select pg_stat_force_next_flush()`);
  const result = await db.execute<{
    relation: string;
    total: string;
    indexes: string;
    search: string | null;
    dead: number;
  }>(sql`select c.relname as relation, pg_total_relation_size(c.oid)::text as total,
      pg_indexes_size(c.oid)::text as indexes,
      (select pg_relation_size(i.indexrelid)::text from pg_stat_user_indexes i
        where i.relid = c.oid and i.indexrelname = 'messages_search_idx') as search,
      coalesce(s.n_dead_tup, 0)::int as dead
    from pg_class c left join pg_stat_user_tables s on s.relid = c.oid
    where c.relname = any(${sql.param(MEASURED_TABLES)}::text[]) and c.relkind = 'r'
    order by c.relname`);
  return result.rows.map((row) => ({
    relation: row.relation,
    totalMib: mib(Number(row.total)),
    indexesMib: mib(Number(row.indexes)),
    searchIndexMib: row.search === null ? null : mib(Number(row.search)),
    deadTuples: row.dead,
  }));
};

export const totalMib = (sizes: readonly RelationSize[]): number =>
  Math.round(sizes.reduce((sum, size) => sum + size.totalMib, 0) * 10) / 10;

export const tempBytes = async (db: DbExecutor): Promise<number> => {
  const result = await db.execute<{ bytes: string }>(sql`select temp_bytes::text as bytes
    from pg_stat_database where datname = current_database()`);
  return Number(result.rows[0]?.bytes ?? 0);
};

const UNITS: Readonly<Record<string, number>> = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 };

const parseUsage = (output: string): number | null => {
  const match = /([\d.]+)\s*(B|KiB|MiB|GiB)/.exec(output);
  if (match === null) {
    return null;
  }
  return Number(match[1]) * (UNITS[match[2] ?? 'B'] ?? 1);
};

const containerMemory = (container: string): Promise<number | null> =>
  new Promise((resolve) => {
    const child = spawn('docker', ['stats', '--no-stream', '--format', '{{.MemUsage}}', container]);
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on('error', () => {
      resolve(null);
    });
    child.on('close', () => {
      resolve(parseUsage(output));
    });
  });

export interface MemorySampler {
  stop(): Promise<{
    readonly baselineMib: number | null;
    readonly peakMib: number | null;
    readonly samples: number;
  }>;
}

export const sampleContainerMemory = async (container: string): Promise<MemorySampler> => {
  const baseline = await containerMemory(container);
  let peak = baseline;
  let samples = 0;
  const state = { running: true };
  const loop = (async () => {
    while (state.running) {
      const usage = await containerMemory(container);
      samples += 1;
      peak = usage === null ? peak : Math.max(peak ?? 0, usage);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })();
  return {
    stop: async () => {
      state.running = false;
      await loop;
      return {
        baselineMib: baseline === null ? null : mib(baseline),
        peakMib: peak === null ? null : mib(peak),
        samples,
      };
    },
  };
};
