import { Controller } from '@nestjs/common';
import { AiService } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AiJob } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { AiJobDispatcher } from './ai-job-dispatcher';

@Controller()
export class AiJobsController {
  constructor(
    private readonly dispatcher: AiJobDispatcher,
    private readonly ai: AiService,
  ) {}

  @ApiRoute(api.ai.createJob)
  create(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.createJob) request: RequestOf<typeof api.ai.createJob>,
  ): Promise<AiJob> {
    return this.dispatcher.create(principal.userId, request.body);
  }

  @ApiRoute(api.ai.getJob)
  get(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.getJob) request: RequestOf<typeof api.ai.getJob>,
  ): Promise<AiJob> {
    return this.ai.getJob(principal.userId, request.params.id);
  }
}
