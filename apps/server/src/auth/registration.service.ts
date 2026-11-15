import { Inject, Injectable } from '@nestjs/common';
import {
  type Clock,
  ConflictError,
  ForbiddenError,
  type IdGenerator,
  PORT_TOKENS,
} from '@relay/engine';
import type { AuthSession, RegisterBody } from '@relay/shared/api';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { SERVER_PORT_TOKENS, type ServerUnitOfWork } from '../core';
import { normalizeEmail } from './normalize-email';
import { PASSWORD_HASHER, type PasswordHasher } from './passwords/password-hasher';
import { SessionIssuer } from './session/session-issuer';

@Injectable()
export class RegistrationService {
  constructor(
    @Inject(SERVER_CONFIG) private readonly config: ServerConfig,
    @Inject(SERVER_PORT_TOKENS.ServerUnitOfWork) private readonly unitOfWork: ServerUnitOfWork,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(PORT_TOKENS.Clock) private readonly clock: Clock,
    @Inject(PORT_TOKENS.IdGenerator) private readonly ids: IdGenerator,
    private readonly sessions: SessionIssuer,
  ) {}

  async register(body: RegisterBody): Promise<AuthSession> {
    if (!this.config.auth.registrationEnabled) {
      throw new ForbiddenError('Registration is disabled on this server');
    }
    const email = normalizeEmail(body.email);
    const passwordHash = await this.hasher.hash(body.password);
    return this.unitOfWork.run(async (repositories) => {
      const existing = await repositories.users.findByEmail(email);
      if (existing !== null) {
        throw new ConflictError('An account with this email already exists');
      }
      const user = await repositories.users.create(
        {
          id: this.ids.generate('user'),
          email,
          displayName: body.displayName,
          createdAt: this.clock.now().toISOString(),
        },
        passwordHash,
      );
      return this.sessions.issue(repositories, user, body.device);
    });
  }
}
