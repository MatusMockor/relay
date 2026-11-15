import 'reflect-metadata';
import { createApp } from './app.factory';
import { parseEnv } from './config/env';
import { toServerConfig } from './config/server-config';

const bootstrap = async (): Promise<void> => {
  const config = toServerConfig(parseEnv(process.env));
  const app = await createApp(config);
  await app.listen({ host: config.http.host, port: config.http.port });
};

await bootstrap();
