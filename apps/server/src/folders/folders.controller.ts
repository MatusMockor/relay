import { Controller } from '@nestjs/common';
import { FolderService } from '@relay/engine';
import { api, type OkResponse } from '@relay/shared/api';
import type { Mailbox } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class FoldersController {
  constructor(private readonly folders: FolderService) {}

  @ApiRoute(api.folders.create)
  create(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.folders.create) request: RequestOf<typeof api.folders.create>,
  ): Promise<Mailbox> {
    return this.folders.create(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.folders.update)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.folders.update) request: RequestOf<typeof api.folders.update>,
  ): Promise<Mailbox> {
    return this.folders.update(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.folders.remove)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.folders.remove) request: RequestOf<typeof api.folders.remove>,
  ): Promise<OkResponse> {
    await this.folders.remove(principal.userId, request.params.id);
    return { ok: true };
  }
}
