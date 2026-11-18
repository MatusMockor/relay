import type { DemoAccountKey, DemoLabelKey } from './types';

export interface DemoAccountSeed {
  readonly key: DemoAccountKey;
  readonly name: string;
  readonly email: string;
  readonly provider: 'imap' | 'gmail';
  readonly color: string;
  readonly isPrimary: boolean;
  readonly interval: number;
  readonly imap: string;
  readonly smtp: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccountSeed[] = [
  {
    key: 'efa',
    name: 'eFabrica',
    email: 'meno@efabrica.sk',
    provider: 'imap',
    color: '#6aa8ff',
    isPrimary: true,
    interval: 300,
    imap: 'imap.efabrica.sk',
    smtp: 'smtp.efabrica.sk',
  },
  {
    key: 'os',
    name: 'Osobný',
    email: 'meno@gmail.com',
    provider: 'gmail',
    color: '#74c4a2',
    isPrimary: false,
    interval: 900,
    imap: 'imap.gmail.com',
    smtp: 'smtp.gmail.com',
  },
  {
    key: 'fl',
    name: 'Freelance',
    email: 'meno@studio.sk',
    provider: 'imap',
    color: '#d9a878',
    isPrimary: false,
    interval: 300,
    imap: 'imap.studio.sk',
    smtp: 'smtp.studio.sk',
  },
];

export const DEMO_LABELS: readonly {
  readonly key: DemoLabelKey;
  readonly acct: DemoAccountKey;
  readonly name: string;
  readonly color: string;
}[] = [
  { key: 'efa', acct: 'efa', name: 'eFabrica', color: '#6aa8ff' },
  { key: 'jira', acct: 'efa', name: 'Jira', color: '#8ea2ff' },
  { key: 'fam', acct: 'os', name: 'Rodina', color: '#5fd39a' },
  { key: 'shop', acct: 'os', name: 'Nákupy', color: '#f2b45a' },
  { key: 'acme', acct: 'os', name: 'Klienti/Acme', color: '#8ea2ff' },
  { key: 'trip', acct: 'os', name: 'Cestovanie', color: '#d48fa8' },
  { key: 'trip-it', acct: 'os', name: 'Cestovanie/Taliansko 2026', color: '#d9a878' },
  { key: 'cli', acct: 'fl', name: 'Klienti', color: '#6aa8ff' },
  { key: 'inv', acct: 'fl', name: 'Faktúry', color: '#ff7a7a' },
];
