import { Controller } from '@nestjs/common';
import { TaskService } from '@relay/engine';
import { api, type TaskPage } from '@relay/shared/api';
import type { Task } from '@relay/shared/domain';
import { CurrentPrincipal } from '../auth/decorators/current-principal.decorator';
import type { Principal } from '../auth/principal';
import { ApiRequest, type RequestOf } from '../http/api-request.decorator';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @ApiRoute(api.tasks.list)
  list(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.tasks.list) request: RequestOf<typeof api.tasks.list>,
  ): Promise<TaskPage> {
    return this.tasks.list(principal.userId, request.query);
  }

  @ApiRoute(api.tasks.update)
  update(
    @CurrentPrincipal() principal: Principal,
    @ApiRequest(api.tasks.update) request: RequestOf<typeof api.tasks.update>,
  ): Promise<Task> {
    return this.tasks.update(principal.userId, request.params.id, request.body);
  }
}
