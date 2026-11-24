import type { StorageNamespace } from 'imapkit';

export const GMAIL = {
  inbox: 'INBOX',
  allMail: '[Gmail]/All Mail',
  sent: '[Gmail]/Sent Mail',
  trash: '[Gmail]/Trash',
  spam: '[Gmail]/Spam',
  drafts: '[Gmail]/Drafts',
} as const;

export const CLIENT_LABEL = 'Klienti';

const FOLDER_LABELS: Readonly<Record<string, string>> = {
  [GMAIL.inbox]: '\\Inbox',
  [GMAIL.sent]: '\\Sent',
  [GMAIL.drafts]: '\\Draft',
  [GMAIL.trash]: '\\Trash',
  [GMAIL.spam]: '\\Spam',
};

const LABEL_FOLDERS: Readonly<Record<string, string>> = {
  '\\inbox': GMAIL.inbox,
  '\\sent': GMAIL.sent,
  '\\draft': GMAIL.drafts,
  '\\drafts': GMAIL.drafts,
  '\\trash': GMAIL.trash,
  '\\spam': GMAIL.spam,
  '\\junk': GMAIL.spam,
};

export const isBin = (path: string): boolean => path === GMAIL.trash || path === GMAIL.spam;

export const isAllMail = (path: string): boolean => path === GMAIL.allMail;

export const isLabelFolder = (path: string): boolean => !isBin(path) && !isAllMail(path);

export const labelOfFolder = (path: string): string => FOLDER_LABELS[path] ?? path;

export const folderOfLabel = (label: string): string | null => {
  if (!label.startsWith('\\')) {
    return label;
  }
  return LABEL_FOLDERS[label.toLowerCase()] ?? null;
};

export const gmailStorage = (labels: readonly string[]): Record<string, StorageNamespace> => ({
  INBOX: {},
  '': {
    separator: '/',
    folders: {
      ...Object.fromEntries(labels.map((label) => [label, {}])),
      '[Gmail]': {
        flags: ['\\Noselect'],
        folders: {
          'All Mail': { 'special-use': '\\All' },
          Drafts: { 'special-use': '\\Drafts' },
          'Sent Mail': { 'special-use': '\\Sent' },
          Spam: { 'special-use': '\\Junk' },
          Trash: { 'special-use': '\\Trash' },
        },
      },
    },
  },
});
