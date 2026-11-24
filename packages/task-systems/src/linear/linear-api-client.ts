import type { LinearCredentials } from '@relay/shared/domain';
import type { z } from 'zod';
import { ProviderHttp, type ProviderHttpOptions } from '../shared/provider-http';
import { linearApiError } from './linear-api-errors';
import { LinearEnvelopeSchema } from './linear-api-schemas';

export const LINEAR_API_URL = 'https://api.linear.app/graphql';

export interface LinearApiClientOptions extends ProviderHttpOptions {
  readonly apiUrl?: string;
}

export interface LinearQuery {
  readonly credentials: LinearCredentials;
  readonly query: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

const INVALID_MESSAGE = 'Linear vrátil neplatnú odpoveď.';

export class LinearApiClient {
  private readonly http: ProviderHttp;
  private readonly apiUrl: string;

  constructor(options: LinearApiClientOptions = {}) {
    this.http = new ProviderHttp(
      { unreachable: 'Linear je nedostupný. Skontroluj pripojenie.', invalid: INVALID_MESSAGE },
      options,
    );
    this.apiUrl = options.apiUrl ?? LINEAR_API_URL;
  }

  async send<Schema extends z.ZodType>(
    request: LinearQuery,
    schema: Schema,
  ): Promise<z.output<Schema>> {
    const response = await this.http.request(this.apiUrl, {
      method: 'POST',
      headers: {
        authorization: request.credentials.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: request.query, variables: request.variables ?? {} }),
    });
    const envelope = LinearEnvelopeSchema.safeParse(await this.http.json(response));
    const failure = linearApiError(
      response.status,
      envelope.success ? (envelope.data.errors ?? []) : [],
    );
    if (failure !== null) {
      throw failure;
    }
    const data: unknown = envelope.success ? envelope.data.data : null;
    return this.http.parse(data, schema);
  }
}
