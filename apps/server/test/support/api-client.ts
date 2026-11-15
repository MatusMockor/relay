import {
  type ApiErrorBody,
  ApiErrorResponseSchema,
  buildUrl,
  type EndpointDefinition,
  type EndpointRequest,
  type EndpointResponse,
  parseEndpointResponse,
} from '@relay/shared/api';
import { assert } from 'vitest';

export interface RawResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface ApiFailure {
  readonly status: number;
  readonly error: ApiErrorBody;
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async raw<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    accessToken?: string,
  ): Promise<RawResponse> {
    const body = (request as { body?: unknown }).body;
    const headers: Record<string, string> = {};
    if (accessToken !== undefined) {
      headers.authorization = `Bearer ${accessToken}`;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(buildUrl(this.baseUrl, endpoint, request), {
      method: endpoint.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text.length === 0 ? null : (JSON.parse(text) as unknown),
    };
  }

  async ok<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    accessToken?: string,
  ): Promise<EndpointResponse<E>> {
    const response = await this.raw(endpoint, request, accessToken);
    if (response.status !== 200) {
      assert.fail(
        `${endpoint.method} ${endpoint.path} returned ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }
    const parsed = parseEndpointResponse(endpoint, response.body);
    if (!parsed.success) {
      assert.fail(
        `${endpoint.method} ${endpoint.path} broke the contract: ${JSON.stringify(parsed.error)}`,
      );
    }
    return parsed.data;
  }

  async fail<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    accessToken?: string,
  ): Promise<ApiFailure> {
    const response = await this.raw(endpoint, request, accessToken);
    const parsed = ApiErrorResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      assert.fail(
        `Expected an error body, got ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }
    return { status: response.status, error: parsed.data.error };
  }
}
