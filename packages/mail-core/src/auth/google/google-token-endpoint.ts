import { ProviderError } from '@relay/engine';
import { GOOGLE_TOKEN_ENDPOINT, type GoogleOAuthClientConfig } from './google-oauth-config';
import {
  GoogleTokenErrorSchema,
  GoogleTokenResponseSchema,
  type GoogleTokenResponse,
} from './google-token-response';

export type FetchFunction = typeof fetch;

const REJECTED_GRANTS = new Set(['invalid_grant', 'unauthorized_client', 'invalid_client']);

export class GoogleTokenRejectedError extends ProviderError {
  constructor(readonly reason: string) {
    super(`Google token request failed: ${reason}`);
  }
}

export const requestGoogleToken = async (
  config: GoogleOAuthClientConfig,
  grant: Readonly<Record<string, string>>,
  fetchFn: FetchFunction = fetch,
): Promise<GoogleTokenResponse> => {
  const body = new URLSearchParams({ client_id: config.clientId, ...grant });
  if (config.clientSecret) {
    body.set('client_secret', config.clientSecret);
  }
  const response = await fetchFn(config.tokenEndpoint ?? GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = GoogleTokenErrorSchema.safeParse(payload);
    const reason = parsedError.success ? parsedError.data.error : `HTTP ${String(response.status)}`;
    if (REJECTED_GRANTS.has(reason)) {
      throw new GoogleTokenRejectedError(reason);
    }
    throw new ProviderError(`Google token request failed: ${reason}`);
  }
  const parsed = GoogleTokenResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderError('Google token endpoint returned an invalid response', {
      cause: parsed.error,
    });
  }
  return parsed.data;
};
