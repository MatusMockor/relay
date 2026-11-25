import type { AccountId, MailAccount } from '@relay/shared/domain';
import { ValidationError } from '../../errors';

export const assertCompleteOrder = (
  accounts: readonly MailAccount[],
  orderedIds: readonly AccountId[],
): void => {
  const known = new Set<string>(accounts.map((account) => account.id));
  const listed = new Set<string>(orderedIds);
  if (listed.size !== orderedIds.length) {
    throw new ValidationError('The account order lists an account more than once');
  }
  const foreign = orderedIds.find((id) => !known.has(id));
  if (foreign !== undefined) {
    throw new ValidationError(`Account ${foreign} is not one of your accounts`);
  }
  if (listed.size !== known.size) {
    throw new ValidationError('The account order must list every account');
  }
};
