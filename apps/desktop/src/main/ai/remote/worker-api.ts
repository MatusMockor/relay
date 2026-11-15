import {
  ApiErrorResponseSchema,
  buildUrl,
  type EndpointDefinition,
  type EndpointRequest,
  type EndpointResponse,
  parseEndpointResponse,
} from '@relay/shared/api';
import type { FetchLike, ServerSession } from './server-session';

const REQUEST_TIMEOUT_MS = 30_000;

export class WorkerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkerApiError';
  }

  get signedOut(): boolean {
    return this.status === 401;
  }

  get leaseLost(): boolean {
    return this.status === 404 || this.status === 409;
  }
}

const SIGNED_OUT = new WorkerApiError(401, 'unauthorized', 'No session for this server');

export class WorkerApi {
  constructor(
    readonly serverUrl: string,
    private readonly session: ServerSession,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async call<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
  ): Promise<EndpointResponse<E>> {
    const token = await this.session.accessToken();
    if (token === null) {
      throw SIGNED_OUT;
    }
    try {
      return await this.send(endpoint, request, token);
    } catch (error) {
      if (!(error instanceof WorkerApiError) || !error.signedOut) {
        throw error;
      }
      const renewed = await this.session.renewAfterRejection(token);
      if (renewed === null) {
        throw error;
      }
      return this.send(endpoint, request, renewed);
    }
  }

  private async send<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    token: string,
  ): Promise<EndpointResponse<E>> {
    const body = (request as { body?: unknown }).body;
    const response = await this.fetchImpl(buildUrl(this.serverUrl, endpoint, request), {
      method: endpoint.method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw toError(payload, response.status);
    }
    const parsed = parseEndpointResponse(endpoint, payload);
    if (!parsed.success) {
      throw new WorkerApiError(response.status, 'internal', parsed.error.message);
    }
    return parsed.data;
  }
}

const toError = (payload: unknown, status: number): WorkerApiError => {
  const parsed = ApiErrorResponseSchema.safeParse(payload);
  if (parsed.success) {
    return new WorkerApiError(status, parsed.data.error.code, parsed.data.error.message);
  }
  return new WorkerApiError(status, 'internal', `Server answered ${String(status)}`);
};
