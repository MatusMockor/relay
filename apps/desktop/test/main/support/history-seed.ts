import type { ImapFlow } from 'imapflow';

const DAY_MS = 86_400_000;
const SPAN_DAYS = 3 * 365;

export interface SeedSpec {
  readonly path: string;
  readonly count: number;
  readonly prefix: string;
  readonly chains?: boolean;
}

export const seedDate = (index: number, count: number): Date =>
  new Date(Date.now() - DAY_MS * SPAN_DAYS * (1 - (index + 0.5) / count));

const chainRoot = (index: number): number => index - (index % 3);

const messageId = (prefix: string, index: number): string =>
  `<${prefix}-${String(index)}@hist.test>`;

const replyHeaders = (spec: SeedSpec, index: number): string[] => {
  const root = chainRoot(index);
  if (spec.chains !== true || root === index) {
    return [];
  }
  const parent = messageId(spec.prefix, index - 1);
  const references = Array.from({ length: index - root }, (_, offset) =>
    messageId(spec.prefix, root + offset),
  );
  return [`In-Reply-To: ${parent}`, `References: ${references.join(' ')}`];
};

const subjectOf = (spec: SeedSpec, index: number): string => {
  if (spec.chains !== true) {
    return `${spec.prefix} sprava ${String(index)}`;
  }
  const root = chainRoot(index);
  const base = `${spec.prefix} vlakno ${String(root)}`;
  return root === index ? base : `Re: ${base}`;
};

export const historyMail = (spec: SeedSpec, index: number, to: string, date: Date): Buffer =>
  Buffer.from(
    [
      `From: ${index % 50 === 0 ? 'Jira <jira@firma.test>' : 'Archiv <archiv@firma.test>'}`,
      `To: ${to}`,
      `Subject: ${index % 50 === 0 ? `[REL-${String(index)}] Chyba` : subjectOf(spec, index)}`,
      `Message-ID: ${messageId(spec.prefix, index)}`,
      ...replyHeaders(spec, index),
      `Date: ${date.toUTCString()}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      `Obsah spravy ${String(index)} v ${spec.path}.`,
    ].join('\r\n'),
  );

export const seedMailbox = async (client: ImapFlow, to: string, spec: SeedSpec): Promise<void> => {
  if (spec.path !== 'INBOX') {
    await client.mailboxCreate(spec.path).catch(() => undefined);
    await client.mailboxSubscribe(spec.path);
  }
  for (let index = 0; index < spec.count; index += 1) {
    const date = seedDate(index, spec.count);
    await client.append(spec.path, historyMail(spec, index, to, date), ['\\Seen'], date);
  }
};
