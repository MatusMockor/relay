import type { AiEvent, AiJobInput, AiRunnerKind } from '@relay/shared/domain';

export interface LocalAiRunRequest {
  readonly input: AiJobInput;
  readonly runner: AiRunnerKind | undefined;
  readonly signal: AbortSignal;
}

export interface LocalAiRuns {
  stream(request: LocalAiRunRequest): AsyncIterable<AiEvent>;
}
