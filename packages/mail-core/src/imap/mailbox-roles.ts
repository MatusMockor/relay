import type { MailboxRole } from '@relay/shared/domain';

export interface MailboxRoleInput {
  readonly path: string;
  readonly name: string;
  readonly flags: ReadonlySet<string>;
  readonly specialUse: string | null;
  readonly labels: boolean;
}

const SPECIAL_USE_ROLES: Readonly<Record<string, MailboxRole>> = {
  '\\inbox': 'inbox',
  '\\sent': 'sent',
  '\\drafts': 'drafts',
  '\\trash': 'trash',
  '\\junk': 'spam',
  '\\archive': 'archive',
  '\\all': 'archive',
  '\\flagged': 'system',
  '\\important': 'system',
};

const NAME_ROLES: readonly (readonly [MailboxRole, readonly string[]])[] = [
  [
    'sent',
    [
      'sent',
      'sent mail',
      'sent items',
      'sent messages',
      'odoslane',
      'odoslana posta',
      'odeslane',
      'odeslana posta',
      'gesendet',
    ],
  ],
  ['drafts', ['drafts', 'draft', 'koncepty', 'rozpracovane', 'entwurfe']],
  ['trash', ['trash', 'bin', 'deleted', 'deleted items', 'deleted messages', 'kos', 'papierkorb']],
  [
    'spam',
    [
      'spam',
      'junk',
      'junk e-mail',
      'junk email',
      'bulk mail',
      'nevyziadana posta',
      'nevyzadana posta',
    ],
  ],
  ['archive', ['archive', 'archives', 'all mail', 'archiv']],
];

const normalize = (value: string): string =>
  value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

const roleFromSpecialUse = (values: readonly string[]): MailboxRole | null => {
  for (const value of values) {
    const role = SPECIAL_USE_ROLES[normalize(value)];
    if (role) {
      return role;
    }
  }
  return null;
};

const roleFromName = (name: string): MailboxRole | null => {
  const normalized = normalize(name);
  const match = NAME_ROLES.find(([, names]) => names.includes(normalized));
  return match ? match[0] : null;
};

export const detectMailboxRole = (input: MailboxRoleInput): MailboxRole => {
  if (normalize(input.path) === 'inbox') {
    return 'inbox';
  }
  const fromFlags = roleFromSpecialUse([
    ...input.flags,
    ...(input.specialUse ? [input.specialUse] : []),
  ]);
  if (fromFlags) {
    return fromFlags;
  }
  if (input.labels) {
    return 'label';
  }
  return roleFromName(input.name) ?? 'custom';
};
