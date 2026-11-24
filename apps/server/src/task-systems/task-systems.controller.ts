import { Controller } from '@nestjs/common';
import { TaskSystemService } from '@relay/engine';
import { api, type OkResponse } from '@relay/shared/api';
import type { ExternalTaskList, TaskSystemConnection } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

const routes = api.taskSystems;

@Controller()
export class TaskSystemsController {
  constructor(private readonly taskSystems: TaskSystemService) {}

  @ApiRoute(routes.list)
  list(@CurrentPrincipal() principal: Principal): Promise<TaskSystemConnection[]> {
    return this.taskSystems.list(principal.userId);
  }

  @ApiRoute(routes.connect)
  connect(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.connect) request: RequestOf<typeof routes.connect>,
  ): Promise<TaskSystemConnection> {
    return this.taskSystems.connect(principal.userId, request.body);
  }

  @ApiRoute(routes.disconnect)
  async disconnect(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.disconnect) request: RequestOf<typeof routes.disconnect>,
  ): Promise<OkResponse> {
    await this.taskSystems.disconnect(principal.userId, request.params.id);
    return { ok: true };
  }

  @ApiRoute(routes.tasks)
  tasks(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(routes.tasks) request: RequestOf<typeof routes.tasks>,
  ): Promise<ExternalTaskList> {
    return this.taskSystems.listTasks(principal.userId, request.params.id);
  }
}
