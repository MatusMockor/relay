import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { backfillNormalizedSubjects } from '../../src/persistence/migrations/backfill-normalized-subjects';
import { seedAccount, seedThread } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

type QueryArgs = Parameters<(text: string, values?: unknown[]) => void>;

const pausingAfterFirstSelect = (client: pg.Client, onSelected: () => Promise<void>): pg.Client => {
  let paused = false;
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'query') {
        return Reflect.get(target, property, receiver) as unknown;
      }
      return async (...args: QueryArgs) => {
        const result = await target.query(...args);
        if (!paused && args[0].trimStart().startsWith('SELECT id, subject')) {
          paused = true;
          await onSelected();
        }
        return result;
      };
    },
  });
};

const connect = async (url: string): Promise<pg.Client> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
};

describe('backfillNormalizedSubjects', () => {
  const context = usePgTestContext();

  it('keeps a subject that changed between reading and updating the batch', async () => {
    const seeded = await seedAccount(context.repositories);
    const { message } = await seedThread(
      context.repositories,
      seeded,
      { subject: 'Re: Starý predmet' },
      { subject: 'Re: Starý predmet' },
    );
    const backfillClient = await connect(context.url);
    const writer = await connect(context.url);
    await writer.query('UPDATE messages SET normalized_subject = NULL WHERE id = $1', [message.id]);

    await backfillNormalizedSubjects(
      pausingAfterFirstSelect(backfillClient, async () => {
        await writer.query(
          'UPDATE messages SET subject = $2, normalized_subject = $3 WHERE id = $1',
          [message.id, 'Nový predmet', 'nový predmet'],
        );
      }),
    );
    const { rows } = await writer.query<{ normalized_subject: string | null }>(
      'SELECT normalized_subject FROM messages WHERE id = $1',
      [message.id],
    );
    await backfillClient.end();
    await writer.end();

    expect(rows).toEqual([{ normalized_subject: 'nový predmet' }]);
  });

  it('normalizes the new subject when only the subject changed after reading', async () => {
    const seeded = await seedAccount(context.repositories);
    const { message } = await seedThread(
      context.repositories,
      seeded,
      { subject: 'Re: Starý predmet' },
      { subject: 'Re: Starý predmet' },
    );
    const backfillClient = await connect(context.url);
    const writer = await connect(context.url);
    await writer.query('UPDATE messages SET normalized_subject = NULL WHERE id = $1', [message.id]);

    await backfillNormalizedSubjects(
      pausingAfterFirstSelect(backfillClient, async () => {
        await writer.query('UPDATE messages SET subject = $2 WHERE id = $1', [
          message.id,
          'Fwd: Nový predmet',
        ]);
      }),
    );
    const { rows } = await writer.query<{ normalized_subject: string | null }>(
      'SELECT normalized_subject FROM messages WHERE id = $1',
      [message.id],
    );
    await backfillClient.end();
    await writer.end();

    expect(rows).toEqual([{ normalized_subject: 'nový predmet' }]);
  });

  it('fills subjects that are still missing', async () => {
    const seeded = await seedAccount(context.repositories);
    const { message } = await seedThread(
      context.repositories,
      seeded,
      { subject: 'Fwd: Ponuka' },
      { subject: 'Fwd: Ponuka' },
    );
    const client = await connect(context.url);
    await client.query('UPDATE messages SET normalized_subject = NULL WHERE id = $1', [message.id]);

    await backfillNormalizedSubjects(client);
    const { rows } = await client.query<{ normalized_subject: string | null }>(
      'SELECT normalized_subject FROM messages WHERE id = $1',
      [message.id],
    );
    await client.end();

    expect(rows).toEqual([{ normalized_subject: 'ponuka' }]);
  });
});
