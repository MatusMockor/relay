import type { AttachmentMeta, ThreadState } from '@relay/shared/domain';
import { AttachmentIdSchema } from '@relay/shared/domain';
import { LOCAL_USER_ID } from '../../src';
import { toMessageRow } from '../../src/mappers/message-mapper';
import { toThreadRow } from '../../src/mappers/thread-mapper';
import { messages, threads } from '../../src/schema';
import { buildMessage, buildThread, messageId, NO_HEADERS, threadId } from './fixtures';
import type { SeededAccount } from './seed';
import type { TestStore } from './test-database';

const WORDS = [
  'faktúra',
  'zmluva',
  'projekt',
  'stretnutie',
  'ponuka',
  'objednávka',
  'termín',
  'rozpočet',
  'správa',
  'porada',
  'dodávka',
  'reklamácia',
  'servis',
  'nasadenie',
  'release',
  'tím',
  'klient',
  'výkaz',
  'cenník',
  'kalendár',
  'dovolenka',
  'školenie',
  'audit',
  'licencia',
];
const SENDERS = [
  'Jana Nováková',
  'Peter Šťastný',
  'Marek Horváth',
  'Eva Kováčová',
  'Tomáš Baláž',
  'Zuzana Bieliková',
  'Martin Varga',
  'Lucia Tóthová',
  'Michal Kráľ',
  'Katarína Hudáková',
];
const STATES: readonly ThreadState[] = [
  'inbox',
  'inbox',
  'inbox',
  'inbox',
  'inbox',
  'inbox',
  'inbox',
  'inbox',
  'done',
  'trash',
];
const BATCH = 500;
const COMBINING_MARKS = /\p{M}/gu;

const asciiLocalPart = (name: string): string =>
  name.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().replace(' ', '.');

const randomOf = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const pdf = (index: number): AttachmentMeta => ({
  id: AttachmentIdSchema.parse(`perf-att-${String(index)}`),
  filename: 'priloha.pdf',
  contentType: 'application/pdf',
  size: 10_240,
  contentId: null,
  inline: false,
});

export const seedSearchPerfMailbox = (
  store: TestStore,
  seeded: SeededAccount,
  messageCount: number,
): void => {
  const random = randomOf(42);
  const pick = <Item>(items: readonly Item[]): Item =>
    items[Math.floor(random() * items.length)] as Item;
  const phrase = (length: number): string => Array.from({ length }, () => pick(WORDS)).join(' ');
  const base = Date.UTC(2020, 0, 1);
  const insertBatch = (start: number): void => {
    const end = Math.min(start + BATCH, messageCount);
    const threadRows = [];
    const messageRows = [];
    for (let index = start; index < end; index += 2) {
      const date = new Date(base + index * 60_000).toISOString();
      const name = pick(SENDERS);
      const from = { name, email: `${asciiLocalPart(name)}@firma.sk` };
      const thread = buildThread({
        id: threadId(`perf-t-${String(index)}`),
        accountId: seeded.account.id,
        subject: phrase(3),
        lastMessageAt: date,
        unread: random() < 0.3,
        state: pick(STATES),
        participants: [from],
      });
      threadRows.push(toThreadRow(LOCAL_USER_ID, thread));
      for (const offset of [0, 1].filter((value) => index + value < end)) {
        const message = buildMessage({
          id: messageId(`perf-m-${String(index + offset)}`),
          threadId: thread.id,
          accountId: seeded.account.id,
          mailboxId: seeded.inbox.id,
          uid: index + offset + 1,
          subject: thread.subject,
          from,
          date,
          snippet: phrase(8),
          textBody: phrase(60),
          attachments: random() < 0.2 ? [pdf(index + offset)] : [],
        });
        messageRows.push(toMessageRow(LOCAL_USER_ID, message, NO_HEADERS));
      }
    }
    store.database.db.insert(threads).values(threadRows).run();
    store.database.db.insert(messages).values(messageRows).run();
  };
  store.database.sqlite.transaction(() => {
    for (let start = 0; start < messageCount; start += BATCH) {
      insertBatch(start);
    }
  })();
};
