import type { AccountId, MailAccount, Mailbox } from '@relay/shared';

export type SidebarSectionKind = 'mbx' | 'lbl';

export interface SidebarSectionsInput {
  readonly account: MailAccount;
  readonly mailboxes: readonly Mailbox[];
  readonly mailboxesLoaded: boolean;
  readonly labelCount: number;
}

export interface SidebarSections {
  readonly folders: boolean;
  readonly labels: boolean;
}

export const keepsFolders = (account: MailAccount, mailboxes: readonly Mailbox[]): boolean =>
  account.provider !== 'gmail' && !mailboxes.some((mailbox) => mailbox.role === 'label');

export const sidebarSections = ({
  account,
  mailboxes,
  mailboxesLoaded,
  labelCount,
}: SidebarSectionsInput): SidebarSections => ({
  folders: mailboxesLoaded && keepsFolders(account, mailboxes),
  labels: mailboxesLoaded || labelCount > 0,
});

export const sectionKey = (kind: SidebarSectionKind, accountId: AccountId): string =>
  `sec:${kind}:${accountId}`;
