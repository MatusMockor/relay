import { ProviderError, ReauthorizationRequiredError } from '@relay/engine';
import type { LinearGraphQlError } from './linear-api-schemas';

export const LINEAR_AUTH_REJECTED_MESSAGE =
  'Linear odmietol API kľúč. Skontroluj, či je platný a má právo čítať.';

const AUTH_CODES = new Set(['AUTHENTICATION_ERROR', 'FORBIDDEN']);
const AUTH_TYPES = new Set(['authentication error', 'forbidden']);

const isAuthError = (error: LinearGraphQlError): boolean =>
  AUTH_CODES.has((error.extensions?.code ?? '').toUpperCase()) ||
  AUTH_TYPES.has((error.extensions?.type ?? '').toLowerCase());

const isRateLimited = (error: LinearGraphQlError): boolean =>
  (error.extensions?.code ?? '').toUpperCase() === 'RATELIMITED';

export const linearApiError = (
  status: number,
  errors: readonly LinearGraphQlError[],
): Error | null => {
  if (status === 401 || status === 403 || errors.some(isAuthError)) {
    return new ReauthorizationRequiredError(LINEAR_AUTH_REJECTED_MESSAGE);
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
