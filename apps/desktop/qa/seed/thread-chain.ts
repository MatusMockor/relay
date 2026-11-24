import { messageIdOf, referencesOf, replySubject } from './message-ids';
import { ownerAddress, senderAt } from './people';
import type { SeedAddress, SeedMessage } from './seed-message';

export interface ThreadSpec {
  readonly subject: string;
  readonly messages: number;
}

export interface ChainOptions {
  readonly owner: string;
  readonly scope: string;
  readonly index: number;
  readonly startedAt: number;
  readonly from?: SeedAddress;
}

const HOUR_MS = 3_600_000;

const bodyOf = (subject: string, position: number): string =>
  [
    'Ahoj,',
    '',
    position === 0
      ? `posielam podklady k téme „${subject}“. Pozri si ich, prosím, keď budeš mať chvíľu.`
      : `reagujem na predchádzajúci e-mail k téme „${subject}“, doplnil som pár poznámok.`,
    'Ak by niečo nesedelo, daj vedieť a dohodneme sa.',
    '',
    'Vďaka,',
  ].join('\n');

export const threadStart = (now: number, total: number, index: number): number =>
  now - (total - index) * 18 * HOUR_MS;

export const threadChain = (spec: ThreadSpec, options: ChainOptions): SeedMessage[] => {
  const chain: string[] = [];
  return Array.from({ length: spec.messages }, (_, position) => {
    const messageId = messageIdOf(`${options.scope}-${String(options.index)}`, position);
    const parent = chain.at(-1);
    const message: SeedMessage = {
      mailbox: 'INBOX',
      messageId,
      from: options.from ?? senderAt(options.index + position),
      to: ownerAddress(options.owner),
      subject: position === 0 ? spec.subject : replySubject(spec.subject),
      text: bodyOf(spec.subject, position),
      date: new Date(options.startedAt + position * 2 * HOUR_MS),
      inReplyTo: parent,
      references: parent === undefined ? undefined : referencesOf(chain),
      seen: options.index % 3 === 0,
    };
    chain.push(messageId);
    return message;
  });
};

export const byDate = (left: { readonly date: Date }, right: { readonly date: Date }): number =>
  left.date.getTime() - right.date.getTime();
