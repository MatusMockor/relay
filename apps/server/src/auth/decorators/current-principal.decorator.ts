import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiException } from '../../http/api-exception';
import type { Principal } from '../principal';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const principal = context.switchToHttp().getRequest<FastifyRequest>().principal;
    if (principal === undefined) {
      throw new ApiException('unauthorized', 'Authentication required');
    }
    return principal;
  },
);
