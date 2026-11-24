import { ProviderError, RateLimitedError, ReauthorizationRequiredError } from '@relay/engine';

export const GITHUB_AUTH_REJECTED_MESSAGE =
  'GitHub odmietol token. Skontroluj, či je platný a nevypršal.';

export const GITHUB_ACCESS_DENIED_MESSAGE =
  'GitHub túto požiadavku pre tento token nepovolil. Skontroluj oprávnenia tokenu (Issues: čítanie).';

export const GITHUB_RATE_LIMITED_MESSAGE =
  'GitHub dočasne obmedzil počet požiadaviek, skús to znova o chvíľu.';

const SECONDARY_LIMIT = /secondary rate limit/i;

const isRateLimited = (response: Response, body: string): boolean =>
  response.status === 429 ||
  response.headers.get('x-ratelimit-remaining') === '0' ||
  SECONDARY_LIMIT.test(body);

export const githubApiError = async (response: Response): Promise<Error> => {
  if (response.status === 401) {
    await response.body?.cancel();
    return new ReauthorizationRequiredError(GITHUB_AUTH_REJECTED_MESSAGE);
  }
  const body = await response.text().catch(() => '');
  if ((response.status === 403 || response.status === 429) && isRateLimited(response, body)) {
    return new RateLimitedError(GITHUB_RATE_LIMITED_MESSAGE);
  }
  if (response.status === 403) {
    return new ProviderError(GITHUB_ACCESS_DENIED_MESSAGE);
  }
  return new ProviderError(`GitHub vrátil stav ${String(response.status)}.`);
};
