import {
  type AccountId,
  type Label,
  type MailAccount,
  type Mailbox,
  RULE_SUGGEST_MAX_ACCOUNTS,
  RULE_SUGGEST_MAX_TARGETS,
  type RuleSuggestAccount,
} from '@relay/shared';
import { moveTargetsOf } from '../../../mail/move-targets';

const ACCOUNT_NAME_MAX = 200;
const TARGET_NAME_MAX = 500;

interface Named<Id extends string> {
  readonly id: Id;
  readonly name: string;
}

const clipped = <Id extends string>(targets: readonly Named<Id>[]): Named<Id>[] =>
  targets
    .filter((target) => target.name.trim() !== '')
    .slice(0, RULE_SUGGEST_MAX_TARGETS)
    .map((target) => ({ id: target.id, name: target.name.slice(0, TARGET_NAME_MAX) }));

export const suggestCatalog = (
  accounts: readonly MailAccount[],
  labels: readonly Label[],
  mailboxes: ReadonlyMap<AccountId, readonly Mailbox[]>,
): RuleSuggestAccount[] =>
  accounts.slice(0, RULE_SUGGEST_MAX_ACCOUNTS).map((account) => ({
    id: account.id,
    name: account.displayName.slice(0, ACCOUNT_NAME_MAX),
    labels: clipped(labels.filter((label) => label.accountId === account.id)),
    folders: clipped(
      moveTargetsOf(mailboxes.get(account.id) ?? []).map((target) => ({
        id: target.mailbox.id,
        name: target.label,
      })),
    ),
  }));
