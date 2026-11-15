import { Inject, Injectable } from '@nestjs/common';
import { type Clock, PORT_TOKENS } from '@relay/engine';
import { SERVER_CONFIG, type ServerConfig } from '../../config/server-config';
import { normalizeEmail } from '../normalize-email';
import { FixedWindowLimiter } from './fixed-window-limiter';

export interface AuthAttempt {
  readonly route: string;
  readonly ip: string;
  readonly body: unknown;
}

const emailOf = (body: unknown): string | null => {
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return null;
  }
  return typeof body.email === 'string' ? normalizeEmail(body.email) : null;
};

const keysFor = (attempt: AuthAttempt): string[] => {
  const keys = [`${attempt.route}|ip|${attempt.ip}`];
  const email = emailOf(attempt.body);
  return email === null ? keys : [...keys, `${attempt.route}|email|${email}`];
};

@Injectable()
export class AuthRateLimiter {
  private readonly limiter: FixedWindowLimiter;

  constructor(
    @Inject(SERVER_CONFIG) config: ServerConfig,
    @Inject(PORT_TOKENS.Clock) clock: Clock,
  ) {
    this.limiter = new FixedWindowLimiter(config.auth.rateLimit, clock);
  }

  allow(attempt: AuthAttempt): boolean {
    return this.limiter.tryAcquire(keysFor(attempt));
  }
}
