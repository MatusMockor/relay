import { api, buildUrl, parseEndpointResponse, type TokenPair } from '@relay/shared/api';
import type { FetchLike } from './server-session';

export type RefreshOutcome =
  | { readonly kind: 'renewed'; readonly tokens: TokenPair }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'unavailable' };

const REQUEST_TIMEOUT_MS = 15_000;
const REJECTED_STATUSES = new Set([400, 401, 403]);
const UNAVAILABLE: RefreshOutcome = { kind: 'unavailable' };

export class TokenRefreshRequest {
  constructor(
    private readonly serverUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async send(refreshToken: string): Promise<RefreshOutcome> {
    const response = await this.fetchImpl(
      buildUrl(this.serverUrl, api.auth.refresh, { body: { refreshToken } }),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    ).catch(() => null);
    if (response === null) {
      return UNAVAILABLE;
    }
    if (REJECTED_STATUSES.has(response.status)) {
      return { kind: 'rejected' };
    }
    if (!response.ok) {
      return UNAVAILABLE;
    }
    const parsed = parseEndpointResponse(api.auth.refresh, await response.json().catch(() => null));
    return parsed.success ? { kind: 'renewed', tokens: parsed.data } : UNAVAILABLE;
  }
}
