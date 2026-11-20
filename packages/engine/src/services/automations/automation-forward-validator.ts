import type { AutomationInput } from '@relay/shared/api';
import type { AutomationActionOf, UserId } from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';

const forwardOf = (input: AutomationInput): AutomationActionOf<'forward'> | undefined =>
  input.actions.find(
    (action): action is AutomationActionOf<'forward'> => action.type === 'forward',
  );

export class AutomationForwardValidator {
  constructor(private readonly accounts: AccountRepository) {}

  async assert(userId: UserId, inputs: readonly AutomationInput[]): Promise<void> {
    for (const input of inputs) {
      await this.assertOne(userId, input);
    }
  }

  private async assertOne(userId: UserId, input: AutomationInput): Promise<void> {
    const forward = forwardOf(input);
    if (forward === undefined) {
      return;
    }
    if (input.accountId === null) {
      throw new ValidationError('Pravidlo pre všetky účty nemôže preposielať, vyber účet');
    }
    const account = await this.accounts.findById(userId, input.accountId);
    if (account?.email.toLowerCase() === forward.to.toLowerCase()) {
      throw new ValidationError(
        `Pravidlo ${input.name} nemôže preposielať na adresu vlastného účtu`,
      );
    }
  }
}
