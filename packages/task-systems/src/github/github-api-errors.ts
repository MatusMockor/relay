import { ProviderError, ReauthorizationRequiredError } from '@relay/engine';

export const GITHUB_AUTH_REJECTED_MESSAGE =
  'GitHub odmietol token. Skontroluj, či je platný a nevypršal.';

export const GITHUB_ACCESS_DENIED_MESSAGE =
  'GitHub túto požiadavku pre tento token nepovolil. Skontroluj oprávnenia tokenu (Issues: čítanie).';

const isRateLimited = (response: Response): boolean =>
  response.status === 429 ||
  response.headers.get('x-ratelimit-remaining') === '0' ||
  response.headers.has('retry-after');

export const githubApiError = (response: Response): Error => {
  if (response.status === 401) {
    return new ReauthorizationRequiredError(GITHUB_AUTH_REJECTED_MESSAGE);
  }
  if ((response.status === 403 || response.status === 429) && isRateLimited(response)) {
    return new ProviderError('GitHub dočasne obmedzil počet požiadaviek. Skús to neskôr.');
  }
  if (response.status === 403) {
    return new ProviderError(GITHUB_ACCESS_DENIED_MESSAGE);
  }
  return new ProviderError(`GitHub vrátil stav ${String(response.status)}.`);
};
