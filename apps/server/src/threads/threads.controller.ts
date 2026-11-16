import { Controller } from '@nestjs/common';
import {
  InboxQueryService,
  MessageActionsService,
  ThreadAiPreparer,
  ThreadChecklistService,
  ThreadQueryService,
} from '@relay/engine';
import { api, type ChecklistResponse, type ThreadPage } from '@relay/shared/api';
import type { ThreadAiState, ThreadDetail, ThreadSummary } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class ThreadsController {
  constructor(
    private readonly inbox: InboxQueryService,
    private readonly threads: ThreadQueryService,
    private readonly actions: MessageActionsService,
    private readonly checklist: ThreadChecklistService,
    private readonly threadAi: ThreadAiPreparer,
  ) {}

  @ApiRoute(api.threads.list)
  list(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.threads.list) request: RequestOf<typeof api.threads.list>,
  ): Promise<ThreadPage> {
    return this.inbox.list(principal.userId, request.query);
  }

  @ApiRoute(api.threads.get)
  get(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.threads.get) request: RequestOf<typeof api.threads.get>,
  ): Promise<ThreadDetail> {
    return this.threads.getDetail(principal.userId, request.params.id);
  }

  @ApiRoute(api.threads.action)
  act(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.threads.action) request: RequestOf<typeof api.threads.action>,
  ): Promise<ThreadSummary> {
    return this.actions.apply(principal.userId, request.params.id, request.body);
  }

  @ApiRoute(api.threads.prepareAi)
  prepareAi(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.threads.prepareAi) request: RequestOf<typeof api.threads.prepareAi>,
  ): Promise<ThreadAiState> {
    return this.threadAi.prepare(principal.userId, request.params.id, request.query.timeZone);
  }

  @ApiRoute(api.threads.updateChecklist)
  updateChecklist(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.threads.updateChecklist)
    request: RequestOf<typeof api.threads.updateChecklist>,
  ): Promise<ChecklistResponse> {
    return this.checklist.update(principal.userId, request.params.id, request.body);
  }
}
