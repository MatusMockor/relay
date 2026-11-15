import pg from 'pg';

const withClient = async (url: string, sql: string): Promise<void> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

export interface QueueFault {
  clear(): Promise<void>;
}

export const rejectQueueInserts = async (
  databaseUrl: string,
  queueName: string,
): Promise<QueueFault> => {
  const literal = queueName.replace(/'/g, "''");
  await withClient(
    databaseUrl,
    `CREATE OR REPLACE FUNCTION pgboss.relay_test_reject_insert() RETURNS trigger
       LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.name = '${literal}' THEN
           RAISE EXCEPTION 'relay test: queue % rejects inserts', NEW.name;
         END IF;
         RETURN NEW;
       END $$;
     CREATE TRIGGER relay_test_reject_insert BEFORE INSERT ON pgboss.job
       FOR EACH ROW EXECUTE FUNCTION pgboss.relay_test_reject_insert();`,
  );
  return {
    clear: () =>
      withClient(
        databaseUrl,
        `DROP TRIGGER IF EXISTS relay_test_reject_insert ON pgboss.job;
         DROP FUNCTION IF EXISTS pgboss.relay_test_reject_insert();`,
      ),
  };
};

export const countQueuedJobs = async (
  databaseUrl: string,
  queueName: string,
  singletonKey: string,
): Promise<number> => {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<{ count: string }>(
      'SELECT count(*) AS count FROM pgboss.job WHERE name = $1 AND singleton_key = $2',
      [queueName, singletonKey],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await client.end();
  }
};
