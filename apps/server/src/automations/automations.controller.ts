import { Controller } from '@nestjs/common';
import { AutomationService } from '@relay/engine';
import {
  api,
  type ApplyAutomationResponse,
  type AutomationPreviewResponse,
} from '@relay/shared/api';
import type { Automation } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class AutomationsController {
  constructor(private readonly automations: AutomationService) {}

  @ApiRoute(api.automations.list)
  list(@CurrentPrincipal() principal: Principal): Promise<Automation[]> {
    return this.automations.list(principal.userId);
  }

  @ApiRoute(api.automations.replace)
  replace(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.automations.replace) request: RequestOf<typeof api.automations.replace>,
  ): Promise<Automation[]> {
    return this.automations.replace(principal.userId, request.body);
  }

  @ApiRoute(api.automations.restoreDefault)
  restoreDefault(@CurrentPrincipal() principal: Principal): Promise<Automation[]> {
    return this.automations.restoreDefault(principal.userId);
  }

  @ApiRoute(api.automations.preview)
  preview(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.automations.preview) request: RequestOf<typeof api.automations.preview>,
  ): Promise<AutomationPreviewResponse> {
    return this.automations.preview(principal.userId, request.body);
  }

  @ApiRoute(api.automations.apply)
  apply(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.automations.apply) request: RequestOf<typeof api.automations.apply>,
  ): Promise<ApplyAutomationResponse> {
    return this.automations.applyToExisting(principal.userId, request.params.id);
  }
}
