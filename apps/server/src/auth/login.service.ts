import { Inject, Injectable } from '@nestjs/common';
import type { AuthSession, LoginBody } from '@relay/shared/api';
import { SERVER_PORT_TOKENS, type ServerUnitOfWork, type UserRepository } from '../core';
import { ApiException } from '../http/api-exception';
import { normalizeEmail } from './normalize-email';
import { PASSWORD_HASHER, type PasswordHasher } from './passwords/password-hasher';
import { SessionIssuer } from './session/session-issuer';

@Injectable()
export class LoginService {
  constructor(
    @Inject(SERVER_PORT_TOKENS.UserRepository) private readonly users: UserRepository,
    @Inject(SERVER_PORT_TOKENS.ServerUnitOfWork) private readonly unitOfWork: ServerUnitOfWork,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly sessions: SessionIssuer,
  ) {}

  async login(body: LoginBody): Promise<AuthSession> {
    const stored = await this.users.findByEmail(normalizeEmail(body.email));
    if (stored === null) {
      await this.hasher.verifyAgainstDummy(body.password);
      throw invalidCredentials();
    }
    const valid = await this.hasher.verify(stored.passwordHash, body.password);
    if (!valid) {
      throw invalidCredentials();
    }
    return this.unitOfWork.run((repositories) =>
      this.sessions.issue(repositories, stored.user, body.device),
    );
  }
}

const invalidCredentials = (): ApiException =>
  new ApiException('unauthorized', 'Invalid email or password');
