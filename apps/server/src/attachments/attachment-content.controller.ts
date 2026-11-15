import { Controller, Req, Res } from '@nestjs/common';
import { AttachmentContentService } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiException } from '../http/api-exception';
import { RawRoute } from '../http/api-route.decorator';
import { contentDisposition } from './content-disposition';

@Controller()
export class AttachmentContentController {
  constructor(private readonly attachments: AttachmentContentService) {}

  @RawRoute(api.attachments.content.method, api.attachments.content.path)
  async content(
    @CurrentPrincipal() principal: Principal,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const params = api.attachments.content.params.safeParse(request.params);
    if (!params.success) {
      throw new ApiException('validation_failed', 'Invalid attachment id');
    }
    const found = await this.attachments.content(principal.userId, params.data.id);
    await reply
      .status(200)
      .header('content-type', found.contentType)
      .header('content-length', found.content.byteLength)
      .header('content-disposition', contentDisposition(found.filename))
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, max-age=0')
      .send(Buffer.from(found.content));
  }
}
