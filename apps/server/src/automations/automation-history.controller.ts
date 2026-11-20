import { Controller } from '@nestjs/common';
import { AutomationHistoryService } from '@relay/engine';
import {
  api,
  type AutomationHistoryResponse,
  type UndoAutomationActivityResponse,
  type UndoAutomationSinceResponse,
} from '@relay/shared/api';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

const endpoints = api.automationHistory;

@Controller()
export class AutomationHistoryController {
  constructor(private readonly history: AutomationHistoryService) {}

  @ApiRoute(endpoints.history)
  list(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(endpoints.history) request: RequestOf<typeof endpoints.history>,
  ): Promise<AutomationHistoryResponse> {
    return this.history.history(principal.userId, request.params.id);
  }

  @ApiRoute(endpoints.undoEntry)
  undoEntry(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(endpoints.undoEntry) request: RequestOf<typeof endpoints.undoEntry>,
  ): Promise<UndoAutomationActivityResponse> {
    return this.history.undo(principal.userId, request.params.id, request.params.entryId);
  }

  @ApiRoute(endpoints.undoSince)
  undoSince(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(endpoints.undoSince) request: RequestOf<typeof endpoints.undoSince>,
  ): Promise<UndoAutomationSinceResponse> {
    return this.history.undoSince(principal.userId, request.params.id, request.body.since);
  }
}
