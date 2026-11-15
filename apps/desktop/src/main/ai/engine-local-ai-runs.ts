import type { EngineServices } from '@relay/engine';
import type { AiEvent, UserId } from '@relay/shared/domain';
import type { LocalAiRunRequest, LocalAiRuns } from './local-ai-runs';

export class EngineLocalAiRuns implements LocalAiRuns {
  constructor(
    private readonly services: Pick<EngineServices, 'ai'>,
    private readonly userId: UserId,
  ) {}

  async *stream(request: LocalAiRunRequest): AsyncGenerator<AiEvent> {
    const body = {
      input: request.input,
      ...(request.runner === undefined ? {} : { runner: request.runner }),
    };
    yield* this.services.ai.run(this.userId, body, request.signal);
  }
}
