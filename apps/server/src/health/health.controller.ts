import { Controller, Inject } from '@nestjs/common';
import { API_VERSION, api, type HealthResponse } from '@relay/shared/api';
import { APP_INFO, type AppInfo } from '../config/app-info';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class HealthController {
  constructor(@Inject(APP_INFO) private readonly appInfo: AppInfo) {}

  @ApiRoute(api.health.get)
  get(): HealthResponse {
    return { name: 'relay', version: this.appInfo.version, apiVersion: API_VERSION };
  }
}
