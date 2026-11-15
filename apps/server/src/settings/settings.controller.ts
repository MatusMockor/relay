import { Controller } from '@nestjs/common';
import { SettingsService } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { UserSettings } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @ApiRoute(api.settings.get)
  get(@CurrentPrincipal() principal: Principal): Promise<UserSettings> {
    return this.settings.get(principal.userId);
  }

  @ApiRoute(api.settings.update)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.settings.update) request: RequestOf<typeof api.settings.update>,
  ): Promise<UserSettings> {
    return this.settings.update(principal.userId, request.body);
  }
}
