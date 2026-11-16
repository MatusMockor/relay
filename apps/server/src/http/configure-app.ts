import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { corsOptions } from './cors-options';
import { registerOctetStreamParser } from './octet-stream-parser';

export const configureApp = (app: NestFastifyApplication): NestFastifyApplication => {
  app.enableCors(corsOptions);
  registerOctetStreamParser(app);
  return app;
};
