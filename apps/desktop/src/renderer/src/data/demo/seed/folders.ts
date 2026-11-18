import type { Mailbox, MailboxRole } from '@relay/shared';
import { demoIds } from './ids';
import type { DemoAccountKey } from './types';

interface DemoMailboxSeed {
  readonly key: string;
  readonly path: string;
  readonly role: MailboxRole;
  readonly subscribed?: boolean;
}

interface DemoAccountMailboxes {
  readonly acct: DemoAccountKey;
  readonly delimiter: string;
  readonly mailboxes: readonly DemoMailboxSeed[];
}

const standard = (prefix: string): DemoMailboxSeed[] => [
  { key: 'inbox', path: 'INBOX', role: 'inbox' },
  { key: 'sent', path: `${prefix}Sent`, role: 'sent' },
  { key: 'archive', path: `${prefix}Archive`, role: 'archive' },
  { key: 'drafts', path: `${prefix}Drafts`, role: 'drafts' },
  { key: 'trash', path: `${prefix}Trash`, role: 'trash' },
  { key: 'spam', path: `${prefix}Junk`, role: 'spam' },
];

const DEMO_MAILBOXES: readonly DemoAccountMailboxes[] = [
  {
    acct: 'efa',
    delimiter: '/',
    mailboxes: [
      ...standard(''),
      { key: 'projekty', path: 'Projekty', role: 'custom' },
      { key: 'alfa', path: 'Projekty/Alfa', role: 'custom' },
      { key: 'beta', path: 'Projekty/Beta', role: 'custom' },
      { key: 'faktury', path: 'Faktúry', role: 'custom' },
      { key: 'zrnko', path: 'Klienti/Zrnko', role: 'custom' },
      { key: 'stare', path: 'Staré', role: 'custom', subscribed: false },
    ],
  },
  {
    acct: 'fl',
    delimiter: '.',
    mailboxes: [
      ...standard('INBOX.'),
      { key: 'zakazky', path: 'INBOX.Zákazky', role: 'custom' },
      { key: 'brezina', path: 'INBOX.Zákazky.Ateliér Brezina', role: 'custom' },
      { key: 'cajovna', path: 'INBOX.Zákazky.Čajovňa', role: 'custom' },
    ],
  },
  {
    acct: 'os',
    delimiter: '/',
    mailboxes: [
      { key: 'inbox', path: 'INBOX', role: 'inbox' },
      { key: 'sent', path: '[Gmail]/Sent Mail', role: 'sent' },
      { key: 'archive', path: '[Gmail]/All Mail', role: 'archive' },
      { key: 'drafts', path: '[Gmail]/Drafts', role: 'drafts' },
      { key: 'trash', path: '[Gmail]/Trash', role: 'trash' },
      { key: 'spam', path: '[Gmail]/Spam', role: 'spam' },
      { key: 'starred', path: '[Gmail]/Starred', role: 'system' },
      { key: 'important', path: '[Gmail]/Important', role: 'system' },
      { key: 'rodina', path: 'Rodina', role: 'label' },
      { key: 'nakupy', path: 'Nákupy', role: 'label' },
      { key: 'klienti', path: 'Klienti', role: 'label' },
      { key: 'acme', path: 'Klienti/Acme', role: 'label' },
      { key: 'cestovanie', path: 'Cestovanie', role: 'label' },
      { key: 'taliansko', path: 'Cestovanie/Taliansko 2026', role: 'label' },
    ],
  },
];

const mailboxIdOf = (acct: DemoAccountKey, key: string) =>
  key === 'inbox' ? demoIds.mailbox(acct) : demoIds.folder(acct, key);

export const buildDemoMailboxes = (): Mailbox[] =>
  DEMO_MAILBOXES.flatMap(({ acct, delimiter, mailboxes }) =>
    mailboxes.map((seed, index) => ({
      id: mailboxIdOf(acct, seed.key),
      accountId: demoIds.account(acct),
      name: seed.path.split(delimiter).at(-1) ?? seed.path,
      path: seed.path,
      delimiter,
      role: seed.role,
      subscribed: seed.subscribed ?? true,
      uidValidity: 1000 + index,
      unreadCount: 0,
      totalCount: 0,
    })),
  );
