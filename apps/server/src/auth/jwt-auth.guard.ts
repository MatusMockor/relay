import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ApiException } from '../http/api-exception';
import { IS_PUBLIC } from './decorators/public.decorator';
import {
  ACCESS_TOKEN_AUTHENTICATOR,
  type AccessTokenAuthenticator,
} from './session/access-token-authenticator';

const BEARER = /^Bearer\s+(\S+)$/i;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_AUTHENTICATOR) private readonly authenticator: AccessTokenAuthenticator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (token === undefined) {
      throw new ApiException('unauthorized', 'Missing bearer token');
    }
    const principal = await this.authenticator.authenticate(token);
    if (principal === null) {
      throw new ApiException('unauthorized', 'Invalid or expired access token');
    }
    request.principal = principal;
    return true;
  }
}
