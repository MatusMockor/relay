import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { backfillHtmlSnippets } from '../../src/persistence/migrations/backfill-html-snippets';
import { buildMessage, buildThread, type SeededAccount, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const MARKUP =
  '<!DOCTYPE html> <html lang="sk" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">';

const GEIS_BODY = `<!DOCTYPE html>
<html lang="sk" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><style>body { font-family: Arial; }</style></head>
<body><p>Zásielka je na ceste k Vám.</p></body></html>`;

const connect = async (url: string): Promise<pg.Client> => {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
};

const snippetOf = async (
  client: pg.Client,
  table: 'messages' | 'threads',
  id: string,
): Promise<string | undefined> => {
  const { rows } = await client.query<{ snippet: string }>(
    `SELECT snippet FROM ${table} WHERE id = $1`,
    [id],
  );
  return rows[0]?.snippet;
};

const seedGeisThread = async (
  context: ReturnType<typeof usePgTestContext>,
  seeded: SeededAccount,
) => {
  const { messages, threads } = context.repositories;
  const thread = await threads.upsert(
    buildThread(seeded.account.id, { snippet: MARKUP, lastMessageAt: '2026-11-23T08:15:00.000Z' }),
  );
  const older = await messages.upsert(
    buildMessage(thread, seeded.mailboxes.inbox, {
      date: '2026-11-20T08:00:00.000Z',
      snippet: 'Objednávka prijatá',
      textBody: 'Objednávka prijatá',
    }),
    new Map(),
  );
  const latest = await messages.upsert(
    buildMessage(thread, seeded.mailboxes.inbox, {
      date: '2026-11-23T08:15:00.000Z',
      snippet: MARKUP,
      textBody: GEIS_BODY,
      htmlBody: GEIS_BODY,
    }),
    new Map(),
  );
  return { thread, older, latest };
};

describe('backfillHtmlSnippets', () => {
  const context = usePgTestContext();

  it('rebuilds markup snippets of messages and threads from the stored bodies', async () => {
    const seeded = await seedAccount(context.repositories);
    const { thread, older, latest } = await seedGeisThread(context, seeded);
    const clean = await context.repositories.threads.upsert(
      buildThread(seeded.account.id, { snippet: '<jan@x.sk> poslal ponuku' }),
    );
    const cleanMessage = await context.repositories.messages.upsert(
      buildMessage(clean, seeded.mailboxes.inbox, { textBody: '<jan@x.sk> poslal ponuku' }),
      new Map(),
    );
    const client = await connect(context.url);

    await backfillHtmlSnippets(client);

    expect(await snippetOf(client, 'messages', latest.id)).toBe('Zásielka je na ceste k Vám.');
    expect(await snippetOf(client, 'threads', thread.id)).toBe('Zásielka je na ceste k Vám.');
    expect(await snippetOf(client, 'messages', older.id)).toBe('Objednávka prijatá');
    expect(await snippetOf(client, 'messages', cleanMessage.id)).toBe('<jan@x.sk> poslal ponuku');
    expect(await snippetOf(client, 'threads', clean.id)).toBe('<jan@x.sk> poslal ponuku');
    await client.end();
  });

  it('cleans the snippet of a message whose body is not stored', async () => {
    const seeded = await seedAccount(context.repositories);
    const thread = await context.repositories.threads.upsert(
      buildThread(seeded.account.id, { snippet: '<html><body><p>Len hlavičky</p></body></html>' }),
    );
    const message = await context.repositories.messages.upsert(
      buildMessage(thread, seeded.mailboxes.inbox, { textBody: null, htmlBody: null }),
      new Map(),
    );
    const client = await connect(context.url);

    await backfillHtmlSnippets(client);

    expect(await snippetOf(client, 'messages', message.id)).toBe('Len hlavičky');
    expect(await snippetOf(client, 'threads', thread.id)).toBe('Len hlavičky');
    await client.end();
  });

  it('changes nothing on a second run', async () => {
    const seeded = await seedAccount(context.repositories);
    await seedGeisThread(context, seeded);
    const client = await connect(context.url);
    await backfillHtmlSnippets(client);

    const second = await backfillHtmlSnippets(client);
    await client.end();

    expect(second).toEqual({ messages: 0, threads: 0 });
  });
});
