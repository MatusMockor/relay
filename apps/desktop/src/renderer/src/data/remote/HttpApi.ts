import {
  ApiErrorResponseSchema,
  DRAFT_ATTACHMENT_UPLOAD_CONTENT_TYPE,
  buildUrl,
  type EndpointDefinition,
  type EndpointRequest,
  type EndpointResponse,
  parseEndpointResponse,
} from '@relay/shared';
import { MailClientError } from '../errors';
import type { AttachmentFile } from '../MailClient';
import type { SessionTokens } from './SessionTokens';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpApiOptions {
  readonly baseUrl: string;
  readonly session: SessionTokens;
  readonly fetch?: FetchLike;
}

const networkError = (url: string) =>
  new MailClientError({ code: 'internal', message: `Server ${url} je nedostupný` });

export class HttpApi {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: HttpApiOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  }

  get baseUrl(): string {
    return this.options.baseUrl;
  }

  async call<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
  ): Promise<EndpointResponse<E>> {
    if (endpoint.auth === 'public') {
      return this.send(endpoint, request, null);
    }
    return this.authorized((token) => this.send(endpoint, request, token));
  }

  upload<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    blob: Blob,
  ): Promise<EndpointResponse<E>> {
    return this.authorized((token) =>
      this.parse(
        endpoint,
        this.fetchImpl(buildUrl(this.options.baseUrl, endpoint, request), {
          method: endpoint.method,
          headers: {
            accept: 'application/json',
            'content-type': DRAFT_ATTACHMENT_UPLOAD_CONTENT_TYPE,
            ...(token === null ? {} : { authorization: `Bearer ${token}` }),
          },
          body: blob,
        }).catch(() => {
          throw networkError(this.options.baseUrl);
        }),
      ),
    );
  }

  download<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
  ): Promise<AttachmentFile> {
    return this.authorized((token) => this.fetchFile(endpoint, request, token));
  }

  private async authorized<T>(run: (token: string | null) => Promise<T>): Promise<T> {
    const token = await this.accessToken();
    try {
      return await run(token);
    } catch (error) {
      if (!(error instanceof MailClientError) || error.code !== 'unauthorized') {
        throw error;
      }
      const renewed = await this.options.session.renew(token);
      if (renewed === null) {
        throw error;
      }
      return run(renewed);
    }
  }

  accessToken(): Promise<string | null> {
    return this.options.session.accessToken();
  }

  renewAccessToken(rejected: string | null): Promise<string | null> {
    return this.options.session.renew(rejected);
  }

  private async fetchFile<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    token: string | null,
  ): Promise<AttachmentFile> {
    const response = await this.request(endpoint, request, token, '*/*');
    if (!response.ok) {
      throw this.toError(await response.json().catch(() => null), response.status);
    }
    const blob = await response.blob();
    return { contentType: response.headers.get('content-type') ?? blob.type, blob };
  }

  private request<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    token: string | null,
    accept: string,
  ): Promise<Response> {
    const url = buildUrl(this.options.baseUrl, endpoint, request);
    const body = (request as { body?: unknown }).body;
    const headers: Record<string, string> = { accept };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (token !== null) {
      headers.authorization = `Bearer ${token}`;
    }
    return this.fetchImpl(url, {
      method: endpoint.method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => {
      throw networkError(this.options.baseUrl);
    });
  }

  private async send<E extends EndpointDefinition>(
    endpoint: E,
    request: EndpointRequest<E>,
    token: string | null,
  ): Promise<EndpointResponse<E>> {
    return this.parse(endpoint, this.request(endpoint, request, token, 'application/json'));
  }

  private async parse<E extends EndpointDefinition>(
    endpoint: E,
    pending: Promise<Response>,
  ): Promise<EndpointResponse<E>> {
    const response = await pending;
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      throw this.toError(payload, response.status);
    }
    const parsed = parseEndpointResponse(endpoint, payload);
    if (!parsed.success) {
      throw new MailClientError(parsed.error, response.status);
    }
    return parsed.data;
  }

  private toError(payload: unknown, status: number): MailClientError {
    const parsed = ApiErrorResponseSchema.safeParse(payload);
    if (parsed.success) {
      return new MailClientError(parsed.data.error, status);
    }
    const code = status === 401 ? 'unauthorized' : 'internal';
    return new MailClientError(
      { code, message: `Server odpovedal chybou ${String(status)}` },
      status,
    );
  }
}
