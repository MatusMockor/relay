import type { Address, Message, ThreadSummary } from '@relay/shared';
import type { DemoThreadRecord } from '../demo-state';
import { atPast, atTime } from './clock';
import { demoIds } from './ids';
import { DEMO_PEOPLE } from './people';
import type { DemoThread } from './types';

export const addressOf = (key: string): Address => {
  const person = DEMO_PEOPLE[key];
  return { name: person?.name ?? key, email: person?.email ?? 'nobody@relay.local' };
};

const snippetOf = (text: string): string =>
  text
    .replace(/^(Ahoj|Ahojte|Čau|Dobrý deň|Milí)[^\n]*\n+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

const buildMessages = (seed: DemoThread, now: Date, order: number): Message[] => {
  const me = `me-${seed.acct}`;
  return seed.msgs.map(([from, at, text, copies], index) => ({
    id: demoIds.message(`${seed.id}-m${String(index)}`),
    threadId: demoIds.thread(seed.id),
    accountId: demoIds.account(seed.acct),
    mailboxId: demoIds.mailbox(seed.acct),
    uid: order * 10 + index + 1,
    messageIdHeader: `<${seed.id}.${String(index)}@demo.relay>`,
    inReplyTo: index === 0 ? null : `<${seed.id}.${String(index - 1)}@demo.relay>`,
    references: [],
    from: addressOf(from),
    to: [addressOf(from === me ? seed.from : me)],
    cc: (copies?.cc ?? []).map(addressOf),
    bcc: (copies?.bcc ?? []).map(addressOf),
    replyTo: [],
    subject: seed.subj,
    date: atPast(now, at, order * 3 + seed.msgs.length - index),
    snippet: snippetOf(text),
    textBody: text,
    htmlBody: index === seed.msgs.length - 1 ? (seed.html ?? null) : null,
    flags: { seen: !(seed.unread ?? false), flagged: false, answered: from === me },
    labelIds: (seed.labels ?? []).map(demoIds.label),
    attachments: [],
  }));
};

const buildSummary = (seed: DemoThread, messages: Message[], now: Date): ThreadSummary => {
  const last = messages.at(-1);
  const participants = [
    ...new Map(
      messages.flatMap((m) => (m.from === null ? [] : [m.from])).map((a) => [a.email, a]),
    ).values(),
  ];
  return {
    id: demoIds.thread(seed.id),
    accountId: demoIds.account(seed.acct),
    subject: seed.subj,
    participants: [
      addressOf(seed.from),
      ...participants.filter((a) => a.email !== addressOf(seed.from).email),
    ],
    lastMessageAt: last?.date ?? now.toISOString(),
    messageCount: Math.max(1, messages.length),
    unread: seed.unread ?? false,
    snippet: last?.snippet ?? '',
    aiOneLiner: seed.ai ?? null,
    jiraKey: seed.key ?? null,
    jiraActor: seed.key === undefined ? null : addressOf(seed.from).name,
    splitIds: seed.split === undefined ? [] : [demoIds.split(seed.split)],
    labelIds: (seed.labels ?? []).map(demoIds.label),
    state: seed.state ?? 'inbox',
    remindAt: seed.remindAt === undefined ? null : atTime(now, seed.remindAt),
    hasDraft: false,
  };
};

export const buildThreadRecord = (seed: DemoThread, now: Date, order: number): DemoThreadRecord => {
  const messages = buildMessages(seed, now, order);
  return {
    summary: buildSummary(seed, messages, now),
    messages,
    aiSummary: seed.sum ?? null,
    checklist: (seed.list ?? []).map((text, index) => ({
      id: `${seed.id}-c${String(index)}`,
      text,
      done: false,
    })),
    replySuggestions: (seed.sugs ?? []).map(([label, body], index) => ({
      id: `${seed.id}-s${String(index)}`,
      label,
      body,
    })),
  };
};
