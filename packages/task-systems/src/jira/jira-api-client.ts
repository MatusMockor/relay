import { ProviderError } from '@relay/engine';
import type { JiraCredentials } from '@relay/shared/domain';
import type { z } from 'zod';
import { jiraApiError } from './jira-api-errors';

export interface JiraApiClientOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export interface JiraApiRequest {
  readonly base: string;
  readonly credentials: JiraCredentials;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly body?: unknown;
  readonly forbiddenMessage?: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;

const basicAuth = (credentials: JiraCredentials): string =>
  `Basic ${Buffer.from(`${credentials.email}:${credentials.apiToken}`).toString('base64')}`;

export class JiraApiClient {
  constructor(private readonly options: JiraApiClientOptions = {}) {}

  async send<Schema extends z.ZodType>(
    request: JiraApiRequest,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const response = await this.fetch(request);
    if (!response.ok) {
      await response.body?.cancel();
      throw jiraApiError(response.status, request.forbiddenMessage);
    }
    const payload: unknown = await response.json().catch(() => null);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ProviderError('Jira vrátila neplatnú odpoveď.', { cause: parsed.error });
    }
    return parsed.data;
  }

  private fetch(request: JiraApiRequest): Promise<Response> {
    const fetchFn = this.options.fetch ?? fetch;
    const headers: Record<string, string> = {
      authorization: basicAuth(request.credentials),
      accept: 'application/json',
    };
    if (request.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    return fetchFn(`${request.base}${request.path}`, {
      method: request.method,
      headers,
      redirect: 'error',
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new ProviderError('Jira je nedostupná. Skontroluj adresu webu a pripojenie.', {
        cause: error,
      });
    });
  }
}
