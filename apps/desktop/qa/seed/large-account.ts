import { messageIdOf, referencesOf, replySubject } from './message-ids';
import { ownerAddress, senderAt } from './people';
import { pick, type Random, seededRandom } from './random';
import type { SeedMessage, SeedScenario } from './seed-message';

export interface LargeAccountOptions {
  readonly count: number;
  readonly replyRatio?: number;
  readonly archiveRatio?: number;
  readonly unreadTail?: number;
  readonly seed?: number;
  readonly now?: Date;
}

interface OpenThread {
  readonly subject: string;
  readonly chain: string[];
}

const TOPICS: readonly string[] = [
  'Objednávka',
  'Faktúra',
  'Stretnutie tímu',
  'Požiadavka zákazníka',
  'Report z nasadenia',
  'Ponuka spolupráce',
  'Zmena v projekte',
  'Otázka k zmluve',
];

const OPEN_THREADS_LIMIT = 64;
const MAX_SPAN_MS = 3 * 365 * 24 * 3_600_000;
const MIN_STEP_MS = 60_000;
const MAX_STEP_MS = 6 * 3_600_000;
export const ARCHIVE_MAILBOX = 'Archive';

const stepOf = (count: number): number =>
  Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, Math.floor(MAX_SPAN_MS / count)));

const startThread = (open: OpenThread[], index: number): OpenThread => {
  const topic = TOPICS[index % TOPICS.length] ?? 'Správa';
  const thread: OpenThread = { subject: `${topic} ${String(index + 1)}`, chain: [] };
  open.push(thread);
  if (open.length > OPEN_THREADS_LIMIT) {
    open.shift();
  }
  return thread;
};

const replyTarget = (random: Random, open: OpenThread[], ratio: number): OpenThread | undefined =>
  random() < ratio ? pick(random, open) : undefined;

function* largeMessages(owner: string, options: LargeAccountOptions): Generator<SeedMessage> {
  const random = seededRandom(options.seed ?? 2027);
  const step = stepOf(options.count);
  const start = (options.now ?? new Date()).getTime() - options.count * step;
  const unreadFrom = options.count - (options.unreadTail ?? 25);
  const open: OpenThread[] = [];
  for (let index = 0; index < options.count; index += 1) {
    const parent = replyTarget(random, open, options.replyRatio ?? 0.35);
    const thread = parent ?? startThread(open, index);
    const messageId = messageIdOf('large', index);
    const previous = thread.chain.at(-1);
    yield {
      mailbox: random() < (options.archiveRatio ?? 0) ? ARCHIVE_MAILBOX : 'INBOX',
      messageId,
      from: senderAt(Math.floor(random() * 1_000)),
      to: ownerAddress(owner),
      subject: previous === undefined ? thread.subject : replySubject(thread.subject),
      text: `Správa ${String(index + 1)} z ${String(options.count)} vo vlákne „${thread.subject}“.`,
      date: new Date(start + index * step),
      inReplyTo: previous,
      references: previous === undefined ? undefined : referencesOf(thread.chain),
      seen: index < unreadFrom && random() < 0.8,
    };
    thread.chain.push(messageId);
  }
}

export const largeAccount = (owner: string, options: LargeAccountOptions): SeedScenario => ({
  mailboxes: (options.archiveRatio ?? 0) > 0 ? ['INBOX', ARCHIVE_MAILBOX] : ['INBOX'],
  total: options.count,
  messages: () => largeMessages(owner, options),
});
