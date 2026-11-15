import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type EndpointDefinition, parseEndpointResponse } from '@relay/shared/api';
import { map, type Observable } from 'rxjs';
import { API_ENDPOINT } from './api-route.decorator';
import { ApiException } from './api-exception';

@Injectable()
export class ContractResponseInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const endpoint = this.reflector.get<EndpointDefinition | undefined>(
      API_ENDPOINT,
      context.getHandler(),
    );
    if (endpoint === undefined) {
      return next.handle();
    }
    return next.handle().pipe(map((data) => toContractResponse(endpoint, data)));
  }
}

const toContractResponse = (endpoint: EndpointDefinition, data: unknown): unknown => {
  const parsed = parseEndpointResponse(endpoint, data);
  if (!parsed.success) {
    throw ApiException.fromBody(parsed.error);
  }
  return parsed.data;
};
