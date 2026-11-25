import type { MailAccount } from './account';

const createdFirst = (left: MailAccount, right: MailAccount): number =>
  Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
  (left.id < right.id ? -1 : Number(left.id > right.id));

export const oldestAccount = <Account extends MailAccount>(
  accounts: readonly Account[],
): Account | undefined => [...accounts].sort(createdFirst)[0];
