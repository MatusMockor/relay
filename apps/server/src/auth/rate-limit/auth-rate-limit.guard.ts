import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ApiException } from '../../http/api-exception';
import { AuthRateLimiter } from './auth-rate-limiter';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: AuthRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const allowed = this.limiter.allow({
      route: request.routeOptions.url ?? request.url,
      ip: request.ip,
      body: request.body,
    });
    if (allowed) {
      return true;
    }
    throw new ApiException('rate_limited', 'Too many attempts, try again later');
  }
}
