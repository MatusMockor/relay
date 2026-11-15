import { Controller } from '@nestjs/common';
import { LabelQueryService } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { Label } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class LabelsController {
  constructor(private readonly labels: LabelQueryService) {}

  @ApiRoute(api.labels.list)
  list(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.labels.list) request: RequestOf<typeof api.labels.list>,
  ): Promise<Label[]> {
    return this.labels.list(principal.userId, request.query);
  }
}
