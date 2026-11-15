import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './config/env';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: parseEnv }),
    HealthModule,
  ],
})
export class AppModule {}
