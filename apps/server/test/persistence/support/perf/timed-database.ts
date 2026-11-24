import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DbExecutor } from '../../../../src/persistence/database/database';

export type StepTimings = Map<string, { count: number; ms: number }>;

export interface TimedDatabase {
  readonly db: DbExecutor;
  readonly timings: StepTimings;
  close(): Promise<void>;
}

const STEPS: readonly (readonly [string, RegExp])[] = [
  ['advisory locks', /pg_advisory_xact_lock/],
  ['row locks', /for update/],
  ['read members', /^select "id", "email_id", "thread_id"/],
  ['temp tables', /create temp table|truncate merge_|insert into merge_/],
  ['placements', /message_placements mp\s+(using|set)/],
  ['json references', /jsonb_path_query|rewritten\.value/],
  [
    'column references',
    /automation_runs|ai_jobs job|update "(drafts|calendar_events|ai_results|automation_activity)"/,
  ],
  ['pending work', /pending_work/],
  ['pending overrides', /coalesce\(o\.seen|with wanted as/],
  ['keeper content', /text_body = d\.text_body/],
  ['keeper gates', /jira_effects_at = merged\./],
  ['aliases', /message_aliases/],
  ['delete losers', /delete from messages/],
  ['primary mirror', /distinct on \(mp\.message_id\)/],
  ['account owner', /"mail_accounts"/],
  ['transaction', /^(begin|commit|rollback|savepoint|release)/i],
];

const textOf = (args: readonly unknown[]): string => {
  const [first] = args;
  if (typeof first === 'string') {
    return first;
  }
  if (typeof first === 'object' && first !== null && 'text' in first) {
    return String(first.text);
  }
  return '';
};

const stepOf = (text: string): string =>
  STEPS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'other';

type Query = (...args: unknown[]) => Promise<unknown>;

const timedQuery = (target: object, timings: StepTimings): Query => {
  const query = Reflect.get(target, 'query', target) as Query;
  return async (...args: unknown[]) => {
    const started = performance.now();
    const result = await query.apply(target, args);
    const step = stepOf(textOf(args));
    const entry = timings.get(step) ?? { count: 0, ms: 0 };
    timings.set(step, { count: entry.count + 1, ms: entry.ms + performance.now() - started });
    return result;
  };
};

const timedClient = (client: pg.PoolClient, timings: StepTimings): pg.PoolClient =>
  new Proxy(client, {
    get: (target, property, receiver) =>
      property === 'query'
        ? timedQuery(target, timings)
        : (Reflect.get(target, property, receiver) as unknown),
  });

export const openTimedDatabase = (url: string): TimedDatabase => {
  const timings: StepTimings = new Map();
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const proxied = new Proxy(pool, {
    get: (target, property, receiver) => {
      if (property === 'query') {
        return timedQuery(target, timings);
      }
      if (property === 'connect') {
        return async () => timedClient(await target.connect(), timings);
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
  });
  return { db: drizzle({ client: proxied }), timings, close: () => pool.end() };
};
