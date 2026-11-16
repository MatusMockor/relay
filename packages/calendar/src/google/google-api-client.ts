import { ProviderError } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import type { z } from 'zod';
import { googleApiError } from './google-api-errors';

export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleAccessTokens {
  accessToken(connectionId: CalendarConnectionId): Promise<string>;
}

export interface GoogleApiClientOptions {
  readonly tokens: GoogleAccessTokens;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface GoogleApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: readonly string[];
  readonly query?: Readonly<Record<string, string | null>>;
  readonly body?: unknown;
  readonly ifMatch?: string;
}

export type GoogleApiOutcome<Value> =
  | { readonly kind: 'ok'; readonly value: Value }
  | { readonly kind: 'status'; readonly status: 404 | 410 | 412 };

const HANDLED = new Set([404, 410, 412]);
const isHandled = (status: number): status is 404 | 410 | 412 => HANDLED.has(status);

export class GoogleApiClient {
  constructor(private readonly options: GoogleApiClientOptions) {}

  async send<Schema extends z.ZodType>(
    connectionId: CalendarConnectionId,
    request: GoogleApiRequest,
    schema: Schema,
  ): Promise<GoogleApiOutcome<z.output<Schema>>> {
    const response = await this.fetch(connectionId, request);
    if (isHandled(response.status)) {
      await response.body?.cancel();
      return { kind: 'status', status: response.status };
    }
    const payload: unknown =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw googleApiError(response.status, payload);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError('Google Calendar API vrátil neplatnú odpoveď.', {
        cause: parsed.error,
      });
    }
    return { kind: 'ok', value: parsed.data };
  }

  private async fetch(
    connectionId: CalendarConnectionId,
    request: GoogleApiRequest,
  ): Promise<Response> {
    const token = await this.options.tokens.accessToken(connectionId);
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    };
    if (request.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (request.ifMatch !== undefined) {
      headers['if-match'] = request.ifMatch;
    }
    const fetchFn = this.options.fetch ?? fetch;
    return fetchFn(this.urlOf(request), {
      method: request.method,
      headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
    }).catch((error: unknown) => {
      throw new ProviderError('Google kalendár je nedostupný.', { cause: error });
    });
  }

  private urlOf(request: GoogleApiRequest): string {
    const base = (this.options.baseUrl ?? GOOGLE_CALENDAR_API).replace(/\/+$/, '');
    const url = new URL(`${base}/${request.path.map(encodeURIComponent).join('/')}`);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== null) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }
}
