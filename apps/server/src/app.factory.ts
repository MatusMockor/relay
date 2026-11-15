import { type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

export interface CreateAppOptions {
  readonly logger?: false | LogLevel[];
}

export const createApp = async (
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: options.logger ?? ['fatal', 'error', 'warn', 'log'],
    bufferLogs: true,
  });
  app.enableShutdownHooks();
  return app;
};
