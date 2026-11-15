import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  type EndpointDefinition,
  parseEndpointRequest,
  type ParsedEndpointRequest,
} from '@relay/shared/api';
import type { FastifyRequest } from 'fastify';
import { ApiException } from './api-exception';

export type RequestOf<E extends EndpointDefinition> = ParsedEndpointRequest<E>;

export const parseHttpRequest = <E extends EndpointDefinition>(
  endpoint: E,
  request: FastifyRequest,
): RequestOf<E> => {
  const result = parseEndpointRequest(endpoint, {
    params: request.params,
    query: request.query,
    body: request.body,
  });
  if (!result.success) {
    throw ApiException.fromBody(result.error);
  }
  return result.data;
};

export const ApiRequest = createParamDecorator(
  (endpoint: EndpointDefinition, context: ExecutionContext) =>
    parseHttpRequest(endpoint, context.switchToHttp().getRequest<FastifyRequest>()),
);
