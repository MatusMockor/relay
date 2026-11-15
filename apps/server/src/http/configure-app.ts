import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { corsOptions } from './cors-options';

export const configureApp = (app: NestFastifyApplication): NestFastifyApplication => {
  app.enableCors(corsOptions);
  return app;
};
