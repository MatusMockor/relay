import { ForbiddenError, ProviderError, ReauthorizationRequiredError } from '@relay/engine';
import { GoogleApiErrorSchema } from './google-api-schemas';

const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded']);

const reasonsOf = (payload: unknown): string[] => {
  const parsed = GoogleApiErrorSchema.safeParse(payload);
  if (!parsed.success) {
    return [];
  }
  const { error } = parsed.data;
  return [
    ...(error.errors ?? []).flatMap((entry) => (entry.reason === undefined ? [] : [entry.reason])),
    ...(error.status === undefined ? [] : [error.status]),
  ];
};

export const googleApiError = (status: number, payload: unknown): Error => {
  const reasons = reasonsOf(payload);
  if (status === 401 || (status === 403 && reasons.some((reason) => SCOPE_REASONS.has(reason)))) {
    return new ReauthorizationRequiredError(
      `Google Calendar API rejected the access (${String(status)})`,
    );
  }
  if (status === 429 || reasons.some((reason) => RATE_REASONS.has(reason))) {
    return new ProviderError('Google kalendár dočasne obmedzil počet požiadaviek. Skús to neskôr.');
  }
  if (status === 403) {
    return new ForbiddenError('Google kalendár túto operáciu nepovolil.');
  }
  return new ProviderError(`Google Calendar API vrátil stav ${String(status)}.`);
};
