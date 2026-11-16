import { Controller, Req, Res } from '@nestjs/common';
import { ComposeService } from '@relay/engine';
import { api, type DraftAttachmentAdded, type DraftAttachmentsForwarded } from '@relay/shared/api';
import { type Draft, MAX_ATTACHMENT_BYTES } from '@relay/shared/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { readLimitedStream, UploadTooLargeException } from './read-limited-stream';

@Controller()
export class DraftAttachmentsController {
  constructor(private readonly compose: ComposeService) {}

  @ApiRoute(api.draftAttachments.add)
  async add(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.draftAttachments.add) request: RequestOf<typeof api.draftAttachments.add>,
    @Req() raw: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DraftAttachmentAdded> {
    await this.compose.getDraft(principal.userId, request.params.id);
    const content = await readLimitedStream(
      raw.body,
      raw.headers['content-length'],
      MAX_ATTACHMENT_BYTES,
    ).catch((error: unknown) => {
      if (error instanceof UploadTooLargeException) {
        void reply.header('connection', 'close');
      }
      throw error;
    });
    return this.compose.addDraftAttachment(principal.userId, request.params.id, {
      filename: request.query.filename,
      contentType: request.query.contentType,
      content,
    });
  }

  @ApiRoute(api.draftAttachments.remove)
  remove(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.draftAttachments.remove)
    request: RequestOf<typeof api.draftAttachments.remove>,
  ): Promise<Draft> {
    return this.compose.removeDraftAttachment(
      principal.userId,
      request.params.id,
      request.params.attachmentId,
    );
  }

  @ApiRoute(api.draftAttachments.forward)
  forward(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.draftAttachments.forward)
    request: RequestOf<typeof api.draftAttachments.forward>,
  ): Promise<DraftAttachmentsForwarded> {
    return this.compose.forwardAttachments(
      principal.userId,
      request.params.id,
      request.body.messageId,
    );
  }
}
