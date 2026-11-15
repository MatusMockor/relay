import type { MailProviderKind, ServerEndpoint } from '@relay/shared/domain';

export type ProviderPresetId =
  | 'gmail'
  | 'outlook'
  | 'icloud'
  | 'yahoo'
  | 'seznam'
  | 'websupport'
  | 'zoznam'
  | 'azet'
  | 'centrum';

export interface ProviderPreset {
  readonly id: ProviderPresetId;
  readonly label: string;
  readonly provider: MailProviderKind;
  readonly domains: readonly string[];
  readonly imap: ServerEndpoint;
  readonly smtp: ServerEndpoint;
  readonly supportsOAuth: boolean;
  readonly requiresAppPassword: boolean;
}

const tls = (host: string, port = 993): ServerEndpoint => ({ host, port, secure: true });
const starttls = (host: string, port = 587): ServerEndpoint => ({ host, port, secure: false });

export const providerPresets: Readonly<Record<ProviderPresetId, ProviderPreset>> = {
  gmail: {
    id: 'gmail',
    label: 'Gmail',
    provider: 'gmail',
    domains: ['gmail.com', 'googlemail.com'],
    imap: tls('imap.gmail.com'),
    smtp: tls('smtp.gmail.com', 465),
    supportsOAuth: true,
    requiresAppPassword: false,
  },
  outlook: {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    provider: 'outlook',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.sk', 'hotmail.sk'],
    imap: tls('outlook.office365.com'),
    smtp: starttls('smtp.office365.com'),
    supportsOAuth: true,
    requiresAppPassword: false,
  },
  icloud: {
    id: 'icloud',
    label: 'iCloud Mail',
    provider: 'imap',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imap: tls('imap.mail.me.com'),
    smtp: starttls('smtp.mail.me.com'),
    supportsOAuth: false,
    requiresAppPassword: true,
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo Mail',
    provider: 'imap',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    imap: tls('imap.mail.yahoo.com'),
    smtp: tls('smtp.mail.yahoo.com', 465),
    supportsOAuth: false,
    requiresAppPassword: true,
  },
  seznam: {
    id: 'seznam',
    label: 'Seznam.cz',
    provider: 'imap',
    domains: ['seznam.cz', 'email.cz', 'post.cz', 'spoluzaci.cz'],
    imap: tls('imap.seznam.cz'),
    smtp: tls('smtp.seznam.cz', 465),
    supportsOAuth: false,
    requiresAppPassword: false,
  },
  websupport: {
    id: 'websupport',
    label: 'Websupport',
    provider: 'imap',
    domains: [],
    imap: tls('imap.websupport.sk'),
    smtp: tls('smtp.websupport.sk', 465),
    supportsOAuth: false,
    requiresAppPassword: false,
  },
  zoznam: {
    id: 'zoznam',
    label: 'Zoznam.sk',
    provider: 'imap',
    domains: ['zoznam.sk'],
    imap: tls('imap.zoznam.sk'),
    smtp: tls('smtp.zoznam.sk', 465),
    supportsOAuth: false,
    requiresAppPassword: false,
  },
  azet: {
    id: 'azet',
    label: 'Azet.sk',
    provider: 'imap',
    domains: ['azet.sk', 'post.sk', 'pobox.sk'],
    imap: tls('imap.azet.sk'),
    smtp: tls('smtp.azet.sk', 465),
    supportsOAuth: false,
    requiresAppPassword: false,
  },
  centrum: {
    id: 'centrum',
    label: 'Centrum.sk',
    provider: 'imap',
    domains: ['centrum.sk', 'atlas.sk'],
    imap: tls('imap.centrum.sk'),
    smtp: tls('smtp.centrum.sk', 465),
    supportsOAuth: false,
    requiresAppPassword: false,
  },
};

export const listProviderPresets = (): ProviderPreset[] => Object.values(providerPresets);

export const findPresetByDomain = (domain: string): ProviderPreset | null =>
  listProviderPresets().find((preset) => preset.domains.includes(domain.toLowerCase())) ?? null;
