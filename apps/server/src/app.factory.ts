import { type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import type { ServerConfig } from './config/server-config';
import { configureApp } from './http/configure-app';
import { createFastifyAdapter } from './http/fastify-adapter.factory';

export interface CreateAppOptions {
  readonly logger?: false | LogLevel[];
}

export const createApp = async (
  config: ServerConfig,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config),
    createFastifyAdapter(config.http.trustProxyHops),
    { logger: options.logger ?? ['fatal', 'error', 'warn', 'log'], bufferLogs: true },
  );
  configureApp(app).enableShutdownHooks();
  return app;
};
