import { Controller } from '@nestjs/common';
import { AiService, type ExternalAiLease } from '@relay/engine';
import {
  type AiJobLeaseResponse,
  type AiJobMailToolsTokenResponse,
  api,
  type ClaimAiJobsResponse,
  MAIL_MCP_PATH,
} from '@relay/shared/api';
import type { AiJob } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';
import { MailToolsTokenService } from './mcp/mail-tools-token.service';

export const DEVICE_MAIL_TOOLS_TTL_SECONDS = 5 * 60;

const leaseOf = (principal: Principal, leaseId: string): ExternalAiLease => ({
  workerId: principal.deviceId,
  leaseId,
});

@Controller()
export class AiWorkerController {
  constructor(
    private readonly ai: AiService,
    private readonly tokens: MailToolsTokenService,
  ) {}

  @ApiRoute(api.ai.claimJobs)
  claim(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.claimJobs) request: RequestOf<typeof api.ai.claimJobs>,
  ): Promise<ClaimAiJobsResponse> {
    return this.ai.claimExternal(principal.userId, principal.deviceId, request.body.limit);
  }

  @ApiRoute(api.ai.heartbeatJob)
  async heartbeat(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.heartbeatJob) request: RequestOf<typeof api.ai.heartbeatJob>,
  ): Promise<AiJobLeaseResponse> {
    const { leaseUntil } = await this.ai.heartbeatExternal(
      principal.userId,
      request.params.id,
      leaseOf(principal, request.body.leaseId),
    );
    return { leaseUntil };
  }

  @ApiRoute(api.ai.completeJob)
  complete(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.completeJob) request: RequestOf<typeof api.ai.completeJob>,
  ): Promise<AiJob> {
    return this.ai.completeExternal(
      principal.userId,
      request.params.id,
      leaseOf(principal, request.body.leaseId),
      { runner: request.body.runner, output: request.body.output },
    );
  }

  @ApiRoute(api.ai.failJob)
  fail(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.failJob) request: RequestOf<typeof api.ai.failJob>,
  ): Promise<AiJob> {
    return this.ai.failExternal(
      principal.userId,
      request.params.id,
      leaseOf(principal, request.body.leaseId),
      { code: request.body.code, message: request.body.message },
    );
  }

  @ApiRoute(api.ai.jobMailToolsToken)
  async mailToolsToken(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.ai.jobMailToolsToken) request: RequestOf<typeof api.ai.jobMailToolsToken>,
  ): Promise<AiJobMailToolsTokenResponse> {
    const { job } = await this.ai.heartbeatExternal(
      principal.userId,
      request.params.id,
      leaseOf(principal, request.body.leaseId),
    );
    const issued = await this.tokens.issue(
      {
        userId: job.userId,
        jobId: job.id,
        holder: { kind: 'device', deviceId: principal.deviceId, leaseId: request.body.leaseId },
      },
      DEVICE_MAIL_TOOLS_TTL_SECONDS,
    );
    return { ...issued, path: MAIL_MCP_PATH };
  }
}
