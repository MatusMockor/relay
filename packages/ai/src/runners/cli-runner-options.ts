import type { AiRunnerLocation } from '@relay/shared/domain';
import type { CliDetector } from '../detection/cli-detector';
import type { CliLauncher } from '../process/cli-process';
import type { PromptLanguage } from '../prompts/prompt-language';
import type { RunWorkspaceFactory } from './run-workspace';

export interface CliRunnerOptions {
  readonly location: AiRunnerLocation;
  readonly language?: PromptLanguage;
  readonly model?: string | null;
  readonly detector?: CliDetector;
  readonly launcher?: CliLauncher;
  readonly workspaces?: RunWorkspaceFactory;
  readonly nonce?: () => string;
  readonly env?: Readonly<Record<string, string>>;
}
