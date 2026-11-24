import { ProviderError, ReauthorizationRequiredError, ValidationError } from '@relay/engine';

export const AUTH_REJECTED_MESSAGE =
  'Jira odmietla prihlasovacie údaje. Skontroluj e-mail a API token.';

export const ACCESS_DENIED_MESSAGE = 'Jira túto požiadavku pre tento účet nepovolila.';

export const SEARCH_DENIED_MESSAGE =
  'Účet nemá v Jira prístup k vyhľadávaniu úloh. Skontroluj oprávnenia účtu alebo rozsah API tokenu.';

export const jiraApiError = (status: number, forbiddenMessage = ACCESS_DENIED_MESSAGE): Error => {
  if (status === 401) {
    return new ReauthorizationRequiredError(AUTH_REJECTED_MESSAGE);
  }
  if (status === 403) {
    return new ProviderError(forbiddenMessage);
  }
  if (status === 404) {
    return new ValidationError('Na tejto adrese sa Jira Cloud nenašla.');
  }
  if (status === 429) {
    return new ProviderError('Jira dočasne obmedzila počet požiadaviek. Skús to neskôr.');
  }
  return new ProviderError(`Jira vrátila stav ${String(status)}.`);
};
