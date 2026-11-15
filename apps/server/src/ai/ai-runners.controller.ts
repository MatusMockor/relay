import { Controller, Inject } from '@nestjs/common';
import { type AiRunnerRegistry, PORT_TOKENS } from '@relay/engine';
import { api } from '@relay/shared/api';
import type { AiRunnerInfo } from '@relay/shared/domain';
import { ApiRoute } from '../http/api-route.decorator';

@Controller()
export class AiRunnersController {
  constructor(@Inject(PORT_TOKENS.AiRunnerRegistry) private readonly registry: AiRunnerRegistry) {}

  @ApiRoute(api.ai.runners)
  runners(): Promise<AiRunnerInfo[]> {
    return this.registry.detectAll();
  }
}
