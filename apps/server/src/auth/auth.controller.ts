import { Controller, UseGuards } from '@nestjs/common';
import {
  api,
  type AuthSession,
  type MeResponse,
  type OkResponse,
  type TokenPair,
} from '@relay/shared/api';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { CurrentPrincipal } from './decorators/current-principal.decorator';
import { LoginService } from './login.service';
import type { Principal } from './principal';
import { AuthRateLimitGuard } from './rate-limit/auth-rate-limit.guard';
import { RegistrationService } from './registration.service';
import { DeviceSessionService } from './session/device-session.service';
import { TokenRefreshService } from './token-refresh.service';

@Controller()
export class AuthController {
  constructor(
    private readonly registration: RegistrationService,
    private readonly login: LoginService,
    private readonly refresh: TokenRefreshService,
    private readonly sessions: DeviceSessionService,
  ) {}

  @ApiRoute(api.auth.register)
  @UseGuards(AuthRateLimitGuard)
  register(
    @ApiRequest(api.auth.register) request: RequestOf<typeof api.auth.register>,
  ): Promise<AuthSession> {
    return this.registration.register(request.body);
  }

  @ApiRoute(api.auth.login)
  @UseGuards(AuthRateLimitGuard)
  signIn(
    @ApiRequest(api.auth.login) request: RequestOf<typeof api.auth.login>,
  ): Promise<AuthSession> {
    return this.login.login(request.body);
  }

  @ApiRoute(api.auth.refresh)
  @UseGuards(AuthRateLimitGuard)
  rotate(
    @ApiRequest(api.auth.refresh) request: RequestOf<typeof api.auth.refresh>,
  ): Promise<TokenPair> {
    return this.refresh.refresh(request.body.refreshToken);
  }

  @ApiRoute(api.auth.logout)
  async logout(@CurrentPrincipal() principal: Principal): Promise<OkResponse> {
    await this.sessions.revoke(principal, principal.deviceId);
    return { ok: true };
  }

  @ApiRoute(api.auth.me)
  me(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return this.sessions.me(principal);
  }
}
