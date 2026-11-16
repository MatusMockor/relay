import pg from 'pg';
import { expect } from 'vitest';

const withClient = async <Result>(
  url: string,
  work: (client: pg.Client) => Promise<Result>,
): Promise<Result> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
};

const partitionOf = async (client: pg.Client, queueName: string): Promise<string> => {
  const result = await client.query<{ partition: string }>(
    'SELECT partition_name AS partition FROM pgboss.queue WHERE name = $1',
    [queueName],
  );
  const partition = result.rows[0]?.partition;
  expect(partition, `pg-boss partition of queue ${queueName}`).toBeTypeOf('string');
  return partition ?? '';
};

const identifier = (client: pg.Client, partition: string): string =>
  `pgboss.${client.escapeIdentifier(partition)}`;

export interface QueueFault {
  clear(): Promise<void>;
}

export const rejectQueueInserts = (databaseUrl: string, queueName: string): Promise<QueueFault> =>
  withClient(databaseUrl, async (client) => {
    const table = identifier(client, await partitionOf(client, queueName));
    await client.query(
      `CREATE OR REPLACE FUNCTION pgboss.relay_test_reject_insert() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           RAISE EXCEPTION 'relay test: queue % rejects inserts', NEW.name;
         END $$;
       CREATE TRIGGER relay_test_reject_insert BEFORE INSERT ON ${table}
         FOR EACH ROW EXECUTE FUNCTION pgboss.relay_test_reject_insert();`,
    );
    return {
      clear: () =>
        withClient(databaseUrl, async (cleaner) => {
          await cleaner.query(
            `DROP TRIGGER IF EXISTS relay_test_reject_insert ON ${table};
             DROP FUNCTION IF EXISTS pgboss.relay_test_reject_insert();`,
          );
        }),
    };
  });

export const countQueuedJobs = async (
  databaseUrl: string,
  queueName: string,
  singletonKey: string,
): Promise<number> =>
  withClient(databaseUrl, async (client) => {
    const result = await client.query<{ count: string }>(
      'SELECT count(*) AS count FROM pgboss.job WHERE name = $1 AND singleton_key = $2',
      [queueName, singletonKey],
    );
    return Number(result.rows[0]?.count ?? 0);
  });
