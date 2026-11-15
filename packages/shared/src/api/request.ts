import type { z } from 'zod';
import type {
  EndpointDefinition,
  EndpointRequest,
  EndpointResponse,
  ParsedEndpointRequest,
} from './endpoint';
import { type ApiErrorBody, toApiErrorIssues } from './errors';

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];

export const buildPath = (
  endpoint: EndpointDefinition,
  params: Readonly<Record<string, string | number>> = {},
): string =>
  endpoint.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing path parameter "${name}" for ${endpoint.method} ${endpoint.path}`);
    }
    return encodeURIComponent(String(value));
  });

const encodePair = (key: string, value: string | number | boolean): string =>
  `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;

export const buildQueryString = (query: Readonly<Record<string, QueryValue>> = {}): string => {
  const pairs = Object.entries(query).flatMap(([key, value]) => {
    if (value === undefined || value === null) {
      return [];
    }
    if (Array.isArray(value)) {
      return value.map((item: string | number) => encodePair(key, item));
    }
    return [encodePair(key, value as string | number | boolean)];
  });
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
};

export const buildUrl = <E extends EndpointDefinition>(
  baseUrl: string,
  endpoint: E,
  request: EndpointRequest<E>,
): string => {
  const parts = request as {
    params?: Record<string, string | number>;
    query?: Record<string, QueryValue>;
  };
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}${buildPath(endpoint, parts.params)}${buildQueryString(parts.query)}`;
};

export interface RawEndpointRequest {
  readonly params?: unknown;
  readonly query?: unknown;
  readonly body?: unknown;
}

export type EndpointParseResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ApiErrorBody };

const parsePart = (
  schema: z.ZodType | undefined,
  value: unknown,
  label: string,
): EndpointParseResult<unknown> => {
  if (schema === undefined) {
    return { success: true, data: undefined };
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: {
      code: 'validation_failed',
      message: `Invalid request ${label}`,
      issues: toApiErrorIssues(result.error),
    },
  };
};

export const parseEndpointRequest = <E extends EndpointDefinition>(
  endpoint: E,
  raw: RawEndpointRequest,
): EndpointParseResult<ParsedEndpointRequest<E>> => {
  const params = parsePart(endpoint.params, raw.params ?? {}, 'params');
  if (!params.success) {
    return params;
  }
  const query = parsePart(endpoint.query, raw.query ?? {}, 'query');
  if (!query.success) {
    return query;
  }
  const body = parsePart(endpoint.body, raw.body, 'body');
  if (!body.success) {
    return body;
  }
  return {
    success: true,
    data: { params: params.data, query: query.data, body: body.data } as ParsedEndpointRequest<E>,
  };
};

export const parseEndpointResponse = <E extends EndpointDefinition>(
  endpoint: E,
  data: unknown,
): EndpointParseResult<EndpointResponse<E>> => {
  const result = endpoint.response.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data as EndpointResponse<E> };
  }
  return {
    success: false,
    error: {
      code: 'internal',
      message: `Unexpected response from ${endpoint.method} ${endpoint.path}`,
      issues: toApiErrorIssues(result.error),
    },
  };
};
