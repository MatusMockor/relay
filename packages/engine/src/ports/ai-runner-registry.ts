import type { AiRunnerInfo, AiRunnerKind } from '@relay/shared/domain';
import type { AiRunner } from './ai-runner';

export interface AiRunnerRegistry {
  get(kind: AiRunnerKind): AiRunner | null;
  list(): AiRunner[];
  detectAll(): Promise<AiRunnerInfo[]>;
}
