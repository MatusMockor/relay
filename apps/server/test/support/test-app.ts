import type { AddressInfo } from 'node:net';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PORT_TOKENS, type TaskSystemAdapterRegistry } from '@relay/engine';
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
  readonly databaseName?: string;
  readonly taskSystems?: TaskSystemAdapterRegistry;
}

const listen = async (app: NestFastifyApplication): Promise<string> => {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.getHttpServer().address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

const createApp = async (config: ServerConfig, clock: ManualClock, options: TestAppOptions) => {
  const builder = Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(PORT_TOKENS.Clock)
    .useValue(clock);
  const moduleRef = await (
    options.taskSystems === undefined
      ? builder
      : builder
          .overrideProvider(PORT_TOKENS.TaskSystemAdapterRegistry)
          .useValue(options.taskSystems)
  ).compile();
  return configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(config.http.trustProxyHops),
      {
        logger: process.env.RELAY_TEST_LOGS === '1' ? ['error', 'warn', 'log', 'debug'] : false,
      },
    ),
  );
};

const releaseAfterFailure = async (
  database: TestDatabase,
  app: NestFastifyApplication | null,
): Promise<void> => {
  await app?.close().catch(() => undefined);
  await database.drop();
};

export const startTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const database: TestDatabase = await createTestDatabase({
    migrate: false,
    ...(options.databaseName === undefined ? {} : { name: options.databaseName }),
  });
  const clock = options.clock ?? new ManualClock();
  let app: NestFastifyApplication | null = null;
  let ready = false;
  try {
    const config = createTestConfig(database.url, options.env);
    app = await createApp(config, clock, options);
    const baseUrl = await listen(app);
    const running = app;
    ready = true;
    return {
      app: running,
      config,
      baseUrl,
      api: new ApiClient(baseUrl),
      clock,
      close: async () => {
        await running.close();
        await database.drop();
      },
    };
  } finally {
    if (!ready) {
      await releaseAfterFailure(database, app);
    }
  }
};
