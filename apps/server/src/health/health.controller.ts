import { Controller, Get, Inject } from '@nestjs/common';
import { API_VERSION, api, type HealthResponse } from '@relay/shared/api';
import { APP_INFO, type AppInfo } from '../config/app-info';

@Controller()
export class HealthController {
  constructor(@Inject(APP_INFO) private readonly appInfo: AppInfo) {}

  @Get(api.health.get.path)
  get(): HealthResponse {
    return { name: 'relay', version: this.appInfo.version, apiVersion: API_VERSION };
  }
}
