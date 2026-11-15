import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PORT_TOKENS } from '@relay/engine';
import { AppModule } from '../../src/app.module';
import type { ServerConfig } from '../../src/config/server-config';
import { createFastifyAdapter } from '../../src/http/fastify-adapter.factory';
import { configureApp } from '../../src/http/configure-app';
import { createTestDatabase, type TestDatabase } from '../persistence/support/test-database';
import { ApiClient } from './api-client';
import { ManualClock } from './manual-clock';
import { createTestConfig, type TestEnv } from './test-config';

export interface TestApp {
  readonly app: NestFastifyApplication;
  readonly config: ServerConfig;
  readonly baseUrl: string;
  readonly api: ApiClient;
  readonly clock: ManualClock;
  close(): Promise<void>;
}

export interface TestAppOptions {
  readonly env?: TestEnv;
  readonly clock?: ManualClock;
}

const listen = async (app: NestFastifyApplication): Promise<string> => {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

export const startTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const database: TestDatabase = await createTestDatabase({ migrate: false });
  const config = createTestConfig(database.url, options.env);
  const clock = options.clock ?? new ManualClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(PORT_TOKENS.Clock)
    .useValue(clock)
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(), {
      logger: process.env.RELAY_TEST_LOGS === '1' ? ['error', 'warn', 'log', 'debug'] : false,
    }),
  );
  const baseUrl = await listen(app);
  return {
    app,
    config,
    baseUrl,
    api: new ApiClient(baseUrl),
    clock,
    close: async () => {
      await app.close();
      await database.drop();
    },
  };
};
