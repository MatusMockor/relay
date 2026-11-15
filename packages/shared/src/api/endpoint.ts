import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type EndpointAuth = 'public' | 'user';

export interface EndpointDefinition {
  readonly method: HttpMethod;
  readonly path: `/${string}`;
  readonly auth: EndpointAuth;
  readonly params?: z.ZodType;
  readonly query?: z.ZodType;
  readonly body?: z.ZodType;
  readonly response: z.ZodType;
}

export const defineEndpoint = <const E extends EndpointDefinition>(endpoint: E): E => endpoint;

type OutputOf<S> = S extends z.ZodType ? z.output<S> : undefined;
type InputOf<S> = S extends z.ZodType ? z.input<S> : undefined;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type RequestPart<Key extends string, S> = S extends z.ZodType
  ? undefined extends z.input<S>
    ? { readonly [P in Key]?: z.input<S> }
    : { readonly [P in Key]: z.input<S> }
  : { readonly [P in Key]?: never };

export type EndpointParams<E extends EndpointDefinition> = OutputOf<E['params']>;
export type EndpointQuery<E extends EndpointDefinition> = OutputOf<E['query']>;
export type EndpointBody<E extends EndpointDefinition> = OutputOf<E['body']>;
export type EndpointResponse<E extends EndpointDefinition> = z.output<E['response']>;

export type EndpointParamsInput<E extends EndpointDefinition> = InputOf<E['params']>;
export type EndpointQueryInput<E extends EndpointDefinition> = InputOf<E['query']>;
export type EndpointBodyInput<E extends EndpointDefinition> = InputOf<E['body']>;

export type EndpointRequest<E extends EndpointDefinition> = Simplify<
  RequestPart<'params', E['params']> &
    RequestPart<'query', E['query']> &
    RequestPart<'body', E['body']>
>;

export interface ParsedEndpointRequest<E extends EndpointDefinition> {
  readonly params: EndpointParams<E>;
  readonly query: EndpointQuery<E>;
  readonly body: EndpointBody<E>;
}

export type ApiCaller = <E extends EndpointDefinition>(
  endpoint: E,
  request: EndpointRequest<E>,
) => Promise<EndpointResponse<E>>;
