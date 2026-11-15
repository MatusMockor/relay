import { Controller } from '@nestjs/common';
import { ComposeService } from '@relay/engine';
import { api, type OkResponse } from '@relay/shared/api';
import type { Draft } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class DraftsController {
  constructor(private readonly compose: ComposeService) {}

  @ApiRoute(api.compose.listDrafts)
  list(@CurrentPrincipal() principal: Principal): Promise<Draft[]> {
    return this.compose.listDrafts(principal.userId);
  }

  @ApiRoute(api.compose.createDraft)
  create(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.compose.createDraft) request: RequestOf<typeof api.compose.createDraft>,
  ): Promise<Draft> {
    return this.compose.createDraft(principal.userId, request.body);
  }

  @ApiRoute(api.compose.updateDraft)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.compose.updateDraft) request: RequestOf<typeof api.compose.updateDraft>,
  ): Promise<Draft> {
    return this.compose.updateDraft(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.compose.deleteDraft)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.compose.deleteDraft) request: RequestOf<typeof api.compose.deleteDraft>,
  ): Promise<OkResponse> {
    await this.compose.deleteDraft(principal.userId, request.params.id);
    return { ok: true };
  }
}
