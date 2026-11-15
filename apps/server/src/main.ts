import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.factory';
import type { Env } from './config/env';

const bootstrap = async (): Promise<void> => {
  const app = await createApp();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen({
    host: config.get('HOST', { infer: true }),
    port: config.get('PORT', { infer: true }),
  });
};

await bootstrap();
