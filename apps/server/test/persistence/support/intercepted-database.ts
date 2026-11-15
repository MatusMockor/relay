import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { DbExecutor } from '../../../src/persistence/database/database';

export interface QueryHook {
  matches(text: string, result: pg.QueryResult): boolean;
  run(): Promise<void>;
}

export interface InterceptedDatabase {
  readonly db: DbExecutor;
  close(): Promise<void>;
}

type PoolQuery = (...args: unknown[]) => Promise<pg.QueryResult>;

const queryText = (args: readonly unknown[]): string => {
  const [first] = args;
  if (typeof first === 'string') {
    return first;
  }
  if (typeof first === 'object' && first !== null && 'text' in first) {
    return String(first.text);
  }
  return '';
};

const interceptOnce = (pool: pg.Pool, hook: QueryHook): pg.Pool => {
  let fired = false;
  return new Proxy(pool, {
    get(target, property, receiver) {
      if (property !== 'query') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return async (...args: unknown[]) => {
        const query = Reflect.get(target, 'query', target) as PoolQuery;
        const result = await query.apply(target, args);
        if (!fired && hook.matches(queryText(args), result)) {
          fired = true;
          await hook.run();
        }
        return result;
      };
    },
  });
};

export const openInterceptedDatabase = (url: string, hook: QueryHook): InterceptedDatabase => {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  return {
    db: drizzle({ client: interceptOnce(pool, hook) }),
    close: () => pool.end(),
  };
};
