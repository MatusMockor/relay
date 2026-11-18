import type { AiEvent } from '@relay/shared/domain';
import type { AiRunRequest } from '@relay/shared/ipc';

export interface LocalAiRunRequest extends AiRunRequest {
  readonly signal: AbortSignal;
}

export interface LocalAiRuns {
  stream(request: LocalAiRunRequest): AsyncIterable<AiEvent>;
}
