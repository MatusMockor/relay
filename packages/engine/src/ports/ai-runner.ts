import type { AiEvent, AiRunnerInfo, AiRunnerKind } from '@relay/shared/domain';
import type { AiRequest } from '../model/ai';

export interface AiRunner {
  readonly kind: AiRunnerKind;
  detect(): Promise<AiRunnerInfo>;
  run(request: AiRequest): AsyncIterable<AiEvent>;
}
