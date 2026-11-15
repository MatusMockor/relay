import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LoginService } from './login.service';
import { Argon2PasswordHasher } from './passwords/argon2-password-hasher';
import { PASSWORD_HASHER } from './passwords/password-hasher';
import { AuthRateLimitGuard } from './rate-limit/auth-rate-limit.guard';
import { AuthRateLimiter } from './rate-limit/auth-rate-limiter';
import { RegistrationService } from './registration.service';
import { ACCESS_TOKEN_AUTHENTICATOR } from './session/access-token-authenticator';
import { DeviceRevocations } from './session/device-revocations';
import { DeviceSessionAuthenticator } from './session/device-session-authenticator';
import { DeviceSessionService } from './session/device-session.service';
import { SessionIssuer } from './session/session-issuer';
import { TokenRefreshService } from './token-refresh.service';
import { AccessTokenService } from './tokens/access-token.service';
import { RefreshTokenCodec } from './tokens/refresh-token.codec';
import { RefreshTokenFactory } from './tokens/refresh-token-factory';

@Module({
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    RefreshTokenCodec,
    RefreshTokenFactory,
    SessionIssuer,
    RegistrationService,
    LoginService,
    TokenRefreshService,
    DeviceSessionService,
    DeviceRevocations,
    AuthRateLimiter,
    AuthRateLimitGuard,
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: ACCESS_TOKEN_AUTHENTICATOR, useClass: DeviceSessionAuthenticator },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [ACCESS_TOKEN_AUTHENTICATOR, DeviceRevocations, DeviceSessionService],
})
export class AuthModule {}
