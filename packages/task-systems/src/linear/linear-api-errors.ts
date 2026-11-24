import { ProviderError, ReauthorizationRequiredError } from '@relay/engine';
import type { LinearGraphQlError } from './linear-api-schemas';

export const LINEAR_AUTH_REJECTED_MESSAGE =
  'Linear odmietol API kľúč. Skontroluj, či je platný a nevypršal.';

export const LINEAR_ACCESS_DENIED_MESSAGE =
  'Linear túto požiadavku pre tento API kľúč nepovolil. Skontroluj oprávnenia kľúča.';

const codeOf = (error: LinearGraphQlError): string => (error.extensions?.code ?? '').toUpperCase();
const typeOf = (error: LinearGraphQlError): string => (error.extensions?.type ?? '').toLowerCase();

const isAuthError = (error: LinearGraphQlError): boolean =>
  codeOf(error) === 'AUTHENTICATION_ERROR' || typeOf(error) === 'authentication error';

const isForbidden = (error: LinearGraphQlError): boolean =>
  codeOf(error) === 'FORBIDDEN' || typeOf(error) === 'forbidden';

const isRateLimited = (error: LinearGraphQlError): boolean => codeOf(error) === 'RATELIMITED';

export const linearApiError = (
  status: number,
  errors: readonly LinearGraphQlError[],
): Error | null => {
  if (status === 401 || errors.some(isAuthError)) {
    return new ReauthorizationRequiredError(LINEAR_AUTH_REJECTED_MESSAGE);
  }
  if (status === 403 || errors.some(isForbidden)) {
    return new ProviderError(LINEAR_ACCESS_DENIED_MESSAGE);
  }
  if (status === 429 || errors.some(isRateLimited)) {
    return new ProviderError('Linear dočasne obmedzil počet požiadaviek. Skús to neskôr.');
  }
  if (status < 200 || status > 299) {
    return new ProviderError(`Linear vrátil stav ${String(status)}.`);
  }
  if (errors.length > 0) {
    return new ProviderError('Linear požiadavku odmietol.', { cause: errors });
  }
  return null;
};
