import { Module } from '@nestjs/common';
import { APP_INFO, readAppInfo } from '../config/app-info';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [{ provide: APP_INFO, useFactory: readAppInfo }],
})
export class HealthModule {}
