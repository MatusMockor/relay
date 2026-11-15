import type {
  AiEvent,
  AiJobId,
  AiJobInput,
  AiRunnerKind,
  ThreadDetail,
  UserId,
} from '@relay/shared/domain';

export interface AiMailToolsEndpoint {
  readonly transport: 'stdio' | 'http';
  readonly command: string | null;
  readonly args: readonly string[];
  readonly url: string | null;
  readonly headers: Readonly<Record<string, string>>;
}

export interface AiRequest {
  readonly jobId: AiJobId | null;
  readonly userId: UserId;
  readonly runner: AiRunnerKind;
  readonly input: AiJobInput;
  readonly thread: ThreadDetail | null;
  readonly mailTools: AiMailToolsEndpoint | null;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | null;
}

export type { AiEvent };
