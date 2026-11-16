import type {
  CreateAccountBody,
  MailAccount,
  TestConnectionBody,
  TestConnectionResponse,
} from '@relay/shared';
import { demoIds } from './seed/ids';

const PALETTE = ['#6aa8ff', '#74c4a2', '#d9a878', '#d48fa8'];

let sequence = 0;
const nextAccountKey = (now: Date): string => {
  sequence += 1;
  return `n${String(now.getTime())}-${String(sequence)}`;
};

export const demoAccountFrom = (
  body: CreateAccountBody,
  existing: readonly MailAccount[],
  now: Date,
): MailAccount => {
  const email =
    body.provider === 'imap' ? body.email : `novy.ucet${String(existing.length + 1)}@gmail.com`;
  const used = new Set(existing.map((account) => account.color));
  const domain = email.split('@')[1] ?? 'ucet';
  const settings =
    body.provider === 'imap'
      ? body.settings
      : {
          imap: { host: 'imap.gmail.com', port: 993, secure: true },
          smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
          username: email,
        };
  return {
    id: demoIds.account(nextAccountKey(now)),
    userId: demoIds.user,
    provider: body.provider,
    displayName:
      body.displayName ??
      (domain.split('.')[0] ?? 'Účet').replace(/^./, (c) => c.toLocaleUpperCase('sk')),
    senderName:
      body.senderName ?? existing.find((account) => account.isPrimary)?.senderName ?? null,
    email,
    color: body.color ?? PALETTE.find((color) => !used.has(color)) ?? PALETTE[0] ?? '#8ea2ff',
    isPrimary: existing.length === 0,
    syncIntervalSeconds: body.syncIntervalSeconds ?? 900,
    settings,
    status: 'connected',
    lastError: null,
    lastSyncedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
};

export const demoTestConnection = (body: TestConnectionBody): TestConnectionResponse => {
  const reachable = (host: string) =>
    /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !host.startsWith('nedostupny');
  const imapOk = reachable(body.settings.imap.host);
  const smtpOk = reachable(body.settings.smtp.host);
  return {
    imap: { ok: imapOk, error: imapOk ? null : `Server ${body.settings.imap.host} neodpovedá` },
    smtp: { ok: smtpOk, error: smtpOk ? null : `Server ${body.settings.smtp.host} neodpovedá` },
  };
};
