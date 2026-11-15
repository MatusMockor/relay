import { Controller } from '@nestjs/common';
import { SplitService } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { Split } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class SplitsController {
  constructor(private readonly splits: SplitService) {}

  @ApiRoute(api.splits.list)
  list(@CurrentPrincipal() principal: Principal): Promise<Split[]> {
    return this.splits.list(principal.userId);
  }

  @ApiRoute(api.splits.replace)
  replace(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.splits.replace) request: RequestOf<typeof api.splits.replace>,
  ): Promise<Split[]> {
    return this.splits.replace(principal.userId, request.body);
  }
}
