import type { NestFastifyApplication } from '@nestjs/platform-fastify';

type CorsOptions = NonNullable<Parameters<NestFastifyApplication['enableCors']>[0]>;

export const corsOptions: CorsOptions = {
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['authorization', 'content-type'],
  exposedHeaders: ['content-disposition', 'content-length', 'content-type'],
  maxAge: 600,
};
