import { ProviderError, ReauthorizationRequiredError, ValidationError } from '@relay/engine';

export const AUTH_REJECTED_MESSAGE =
  'Jira odmietla prihlasovacie údaje. Skontroluj e-mail a API token.';

export const jiraApiError = (status: number): Error => {
  if (status === 401 || status === 403) {
    return new ReauthorizationRequiredError(AUTH_REJECTED_MESSAGE);
  }
  if (status === 404) {
    return new ValidationError('Na tejto adrese sa Jira Cloud nenašla.');
  }
  if (status === 429) {
    return new ProviderError('Jira dočasne obmedzila počet požiadaviek. Skús to neskôr.');
  }
  return new ProviderError(`Jira vrátila stav ${String(status)}.`);
};
