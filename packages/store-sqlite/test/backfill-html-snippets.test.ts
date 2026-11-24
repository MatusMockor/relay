import type { Message } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { migrate, type SnippetBuilder } from '../src';
import { backfillHtmlSnippets } from '../src/database/backfill-html-snippets';
import { bodyMessage, seedBodyRows } from './support/body-store-seed';
import { buildThread, messageId, threadId } from './support/fixtures';
import { seedAccount } from './support/seed';
import { createTestStore, type TestStore } from './support/test-database';

const MARKUP =
  '<!DOCTYPE html> <html lang="sk" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">';

const readableSnippet: SnippetBuilder = (text, html) => {
  const source = html ?? text ?? '';
  if (!/^<(?:!doctype|html)/i.test(source)) {
    return source;
  }
  return source
    .replace(/<[^>]*>?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const snippetOf = (store: TestStore, table: 'messages' | 'threads', id: string): string =>
  store.database.sqlite
    .prepare<[string], { snippet: string }>(`select snippet from ${table} where id = ?`)
    .get(id)?.snippet ?? '';

const setup = async () => {
  const store = createTestStore();
  const seeded = await seedAccount(store.repositories);
  const message = (index: number, overrides: Partial<Message>): Message =>
    bodyMessage(seeded, index, 10 - index, overrides);
  seedBodyRows(store, [
    message(1, {
      threadId: threadId('thr-geis'),
      snippet: 'Staršia správa',
      textBody: 'Staršia správa',
    }),
    message(2, {
      threadId: threadId('thr-geis'),
      snippet: MARKUP,
      textBody: `${MARKUP}<body><p>Zásielka je na ceste k Vám.</p></body></html>`,
      htmlBody: '<html><body><p>Zásielka je na ceste k Vám.</p></body></html>',
    }),
    message(3, {
      threadId: threadId('thr-header-only'),
      snippet: '<html><body><p>Len hlavičky</p></body></html>',
      textBody: null,
      htmlBody: null,
    }),
    message(4, {
      threadId: threadId('thr-clean'),
      snippet: '<jan@x.sk> poslal ponuku',
      textBody: '<jan@x.sk> poslal ponuku',
    }),
    message(5, { threadId: threadId('thr-plain'), snippet: 'Dobrý deň' }),
  ]);
  const threads = [
    buildThread({ id: threadId('thr-geis'), accountId: seeded.account.id, snippet: MARKUP }),
    buildThread({
      id: threadId('thr-header-only'),
      accountId: seeded.account.id,
      snippet: '<html><body><p>Len hlavičky</p></body></html>',
    }),
    buildThread({
      id: threadId('thr-clean'),
      accountId: seeded.account.id,
      snippet: '<jan@x.sk> poslal ponuku',
    }),
    buildThread({ id: threadId('thr-plain'), accountId: seeded.account.id, snippet: 'Dobrý deň' }),
    buildThread({ id: threadId('thr-empty'), accountId: seeded.account.id, snippet: MARKUP }),
  ];
  for (const thread of threads) {
    await store.repositories.threads.upsert(thread);
  }
  return store;
};

describe('backfillHtmlSnippets', () => {
  it('rewrites markup snippets of messages and threads and leaves clean rows alone', async () => {
    const store = await setup();

    expect(backfillHtmlSnippets(store.database, readableSnippet)).toEqual({
      messages: 2,
      threads: 2,
    });

    expect(snippetOf(store, 'messages', messageId('body-2'))).toBe('Zásielka je na ceste k Vám.');
    expect(snippetOf(store, 'messages', messageId('body-3'))).toBe('Len hlavičky');
    expect(snippetOf(store, 'messages', messageId('body-1'))).toBe('Staršia správa');
    expect(snippetOf(store, 'messages', messageId('body-4'))).toBe('<jan@x.sk> poslal ponuku');
    expect(snippetOf(store, 'messages', messageId('body-5'))).toBe('Dobrý deň');
    expect(snippetOf(store, 'threads', 'thr-geis')).toBe('Zásielka je na ceste k Vám.');
    expect(snippetOf(store, 'threads', 'thr-header-only')).toBe('Len hlavičky');
    expect(snippetOf(store, 'threads', 'thr-clean')).toBe('<jan@x.sk> poslal ponuku');
    expect(snippetOf(store, 'threads', 'thr-plain')).toBe('Dobrý deň');
    expect(snippetOf(store, 'threads', 'thr-empty')).toBe(MARKUP);
  });

  it('changes nothing on a second run', async () => {
    const store = await setup();
    backfillHtmlSnippets(store.database, readableSnippet);

    expect(backfillHtmlSnippets(store.database, readableSnippet)).toEqual({
      messages: 0,
      threads: 0,
    });
  });

  it('runs as part of migrate when a snippet builder is given', async () => {
    const store = await setup();

    migrate(store.database, { snippetBuilder: readableSnippet });

    expect(snippetOf(store, 'messages', messageId('body-2'))).toBe('Zásielka je na ceste k Vám.');
    expect(snippetOf(store, 'threads', 'thr-geis')).toBe('Zásielka je na ceste k Vám.');
  });
});
