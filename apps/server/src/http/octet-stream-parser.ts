import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DRAFT_ATTACHMENT_UPLOAD_CONTENT_TYPE } from '@relay/shared/api';

export const registerOctetStreamParser = (app: NestFastifyApplication): void => {
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(DRAFT_ATTACHMENT_UPLOAD_CONTENT_TYPE, (_request, payload, done) => {
      done(null, payload);
    });
};
