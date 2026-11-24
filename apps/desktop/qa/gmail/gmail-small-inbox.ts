import { messageIdOf } from '../seed/message-ids';
import { ownerAddress } from '../seed/people';
import { byDate, threadChain, threadStart, type ThreadSpec } from '../seed/thread-chain';
import { CLIENT_LABEL, GMAIL } from './gmail-layout';
import type { GmailSeed, GmailSeedMessage } from './gmail-seed';

export type GmailPlacement = 'inbox' | 'label' | 'archived' | 'self';

export interface GmailThreadSpec extends ThreadSpec {
  readonly placement: GmailPlacement;
}

export const GMAIL_SMALL_THREADS: readonly GmailThreadSpec[] = [
  { subject: 'Ponuka pre klienta Alfa', messages: 3, placement: 'label' },
  { subject: 'Rozpis služieb na december', messages: 2, placement: 'inbox' },
  { subject: 'Newsletter: novinky v produkte', messages: 1, placement: 'archived' },
  { subject: 'Zmluva - klient Beta', messages: 2, placement: 'label' },
  { subject: 'Potvrdenie objednávky č. 4471', messages: 1, placement: 'archived' },
  { subject: 'Stretnutie s tímom v pondelok', messages: 2, placement: 'inbox' },
  { subject: 'Poznámka pre seba: prístupy k VPN', messages: 1, placement: 'self' },
  { subject: 'Otázka k API dokumentácii', messages: 1, placement: 'inbox' },
  { subject: 'Klient Gama - požiadavky', messages: 1, placement: 'label' },
  { subject: 'Faktúra za hosting 11/2026', messages: 1, placement: 'inbox' },
];

const FOLDERS: Readonly<Record<GmailPlacement, readonly string[]>> = {
  inbox: [GMAIL.inbox],
  label: [GMAIL.inbox, CLIENT_LABEL],
  archived: [],
  self: [GMAIL.inbox, GMAIL.sent],
};

export const threadsPlaced = (placement: GmailPlacement): string[] =>
  GMAIL_SMALL_THREADS.filter((thread) => thread.placement === placement).map(
    (thread) => thread.subject,
  );

export const gmailSmallInbox = (owner: string, now: Date = new Date()): GmailSeed => {
  const messages: GmailSeedMessage[] = GMAIL_SMALL_THREADS.flatMap((thread, index) =>
    threadChain(thread, {
      owner,
      scope: 'gmail-small',
      index,
      startedAt: threadStart(now.getTime(), GMAIL_SMALL_THREADS.length, index),
      from: thread.placement === 'self' ? ownerAddress(owner) : undefined,
    }).map((message) => ({ message, folders: FOLDERS[thread.placement] })),
  ).sort((left, right) => byDate(left.message, right.message));
  return { total: messages.length, messages: () => messages };
};

export const gmailSmallMessageId = (subject: string, position = 0): string =>
  messageIdOf(
    `gmail-small-${String(GMAIL_SMALL_THREADS.findIndex((thread) => thread.subject === subject))}`,
    position,
  );
