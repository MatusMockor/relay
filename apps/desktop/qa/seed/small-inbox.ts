import type { SeedScenario } from './seed-message';
import { byDate, threadChain, threadStart, type ThreadSpec } from './thread-chain';

export type SmallThread = ThreadSpec;

export const SMALL_INBOX_THREADS: readonly SmallThread[] = [
  { subject: 'Rozpočet na rok 2027', messages: 3 },
  { subject: 'Pozvánka na workshop o bezpečnosti', messages: 2 },
  { subject: 'Faktúra č. 2026-118', messages: 1 },
  { subject: 'Zmluva s dodávateľom - pripomienky', messages: 4 },
  { subject: 'Obed v piatok?', messages: 2 },
  { subject: 'Release 0.2 - poznámky k vydaniu', messages: 1 },
  { subject: 'Školenie nových kolegov', messages: 1 },
  { subject: 'Prístup do VPN', messages: 2 },
  { subject: 'Týždenný report', messages: 1 },
  { subject: 'Dovolenka v decembri', messages: 1 },
  { subject: 'Nová verzia cenníka', messages: 1 },
  { subject: 'Ďakujem za stretnutie', messages: 1 },
];

export const smallInbox = (owner: string, now: Date = new Date()): SeedScenario => {
  const messages = SMALL_INBOX_THREADS.flatMap((thread, index) =>
    threadChain(thread, {
      owner,
      scope: 'small',
      index,
      startedAt: threadStart(now.getTime(), SMALL_INBOX_THREADS.length, index),
    }),
  ).sort(byDate);
  return { mailboxes: ['INBOX'], total: messages.length, messages: () => messages };
};
