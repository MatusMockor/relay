import { Controller } from '@nestjs/common';
import { ComposeService } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { DraftAttachment } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class AttachmentsController {
  constructor(private readonly compose: ComposeService) {}

  @ApiRoute(api.attachments.upload)
  upload(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.attachments.upload) request: RequestOf<typeof api.attachments.upload>,
  ): Promise<DraftAttachment> {
    return this.compose.uploadAttachment(principal.userId, request.body);
  }
}
