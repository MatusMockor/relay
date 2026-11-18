import { Controller } from '@nestjs/common';
import { LabelQueryService, LabelService } from '@relay/engine';
import { api, type OkResponse } from '@relay/shared/api';
import type { Label } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class LabelsController {
  constructor(
    private readonly labels: LabelQueryService,
    private readonly admin: LabelService,
  ) {}

  @ApiRoute(api.labels.list)
  list(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.labels.list) request: RequestOf<typeof api.labels.list>,
  ): Promise<Label[]> {
    return this.labels.list(principal.userId, request.query);
  }

  @ApiRoute(api.labels.create)
  create(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.labels.create) request: RequestOf<typeof api.labels.create>,
  ): Promise<Label> {
    return this.admin.create(principal.userId, request.body);
  }

  @ApiRoute(api.labels.update)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.labels.update) request: RequestOf<typeof api.labels.update>,
  ): Promise<Label> {
    return this.admin.update(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.labels.remove)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.labels.remove) request: RequestOf<typeof api.labels.remove>,
  ): Promise<OkResponse> {
    await this.admin.remove(principal.userId, request.params.id);
    return { ok: true };
  }
}
