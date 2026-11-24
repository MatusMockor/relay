import { type AutomationInput, isParameterizedAction, type MailAccount } from '@relay/shared';

const ALL_ACCOUNTS_MESSAGE = 'Pravidlo pre všetky účty nemôže presúvať ani štítkovať, vyber účet';
const ALL_ACCOUNTS_FORWARD = 'Pravidlo pre všetky účty nemôže preposielať, vyber účet';

const forwardIssue = (input: AutomationInput, accounts: readonly MailAccount[]): string | null => {
  const forward = input.actions.find((action) => action.type === 'forward');
  if (forward === undefined) {
    return null;
  }
  if (input.accountId === null) {
    return ALL_ACCOUNTS_FORWARD;
  }
  const account = accounts.find((item) => item.id === input.accountId);
  if (account?.email.toLowerCase() === forward.to.toLowerCase()) {
    return `Pravidlo ${input.name} nemôže preposielať na adresu vlastného účtu`;
  }
  return null;
};

export const demoActionScopeIssue = (
  inputs: readonly AutomationInput[],
  accounts: readonly MailAccount[],
): string | null => {
  if (
    inputs.some((input) => input.accountId === null && input.actions.some(isParameterizedAction))
  ) {
    return ALL_ACCOUNTS_MESSAGE;
  }
  return (
    inputs.map((input) => forwardIssue(input, accounts)).find((issue) => issue !== null) ?? null
  );
};
