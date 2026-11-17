import { randomUUID } from 'node:crypto';
import type { AiRequest, AiRunner } from '@relay/engine';
import type {
  AiEvent,
  AiOutput,
  AiRunnerInfo,
  AiRunnerKind,
  AiRunnerLocation,
} from '@relay/shared/domain';
import { toRunnerInfo } from '../detection/cli-detection';
import { CliDetector } from '../detection/cli-detector';
import { ExecaCliLauncher } from '../process/execa-cli-launcher';
import type { CliLauncher } from '../process/cli-process';
import type { PreparedPrompt } from '../prompts/prepared-prompt';
import { DEFAULT_PROMPT_LANGUAGE, type PromptLanguage } from '../prompts/prompt-language';
import { prepareTaskPrompt } from '../prompts/task-prompts';
import type { CliDialect } from './cli-dialect';
import type { CliRunnerOptions } from './cli-runner-options';
import { runAttempt, type AttemptOutcome } from './run-attempt';
import {
  TempRunWorkspaceFactory,
  type RunWorkspace,
  type RunWorkspaceFactory,
} from './run-workspace';

export class CliAiRunner implements AiRunner {
  readonly kind: AiRunnerKind;
  private readonly location: AiRunnerLocation;
  private readonly language: PromptLanguage;
  private readonly detector: CliDetector;
  private readonly launcher: CliLauncher;
  private readonly workspaces: RunWorkspaceFactory;
  private readonly nonce: () => string;
  private readonly env: Readonly<Record<string, string>>;

  constructor(
    private readonly dialect: CliDialect,
    options: CliRunnerOptions,
  ) {
    this.kind = dialect.kind;
    this.location = options.location;
    this.language = options.language ?? DEFAULT_PROMPT_LANGUAGE;
    this.detector = options.detector ?? new CliDetector();
    this.launcher = options.launcher ?? new ExecaCliLauncher();
    this.workspaces = options.workspaces ?? new TempRunWorkspaceFactory();
    this.nonce = options.nonce ?? (() => randomUUID().replace(/-/g, ''));
    this.env = options.env ?? {};
  }

  async detect(): Promise<AiRunnerInfo> {
    return toRunnerInfo(await this.detector.detect(this.kind), this.location);
  }

  run(request: AiRequest): AsyncIterable<AiEvent> {
    return this.execute(request);
  }

  private async *execute(request: AiRequest): AsyncGenerator<AiEvent> {
    if (request.signal?.aborted === true) {
      yield { type: 'failed', code: 'cancelled', message: 'AI run was cancelled' };
      return;
    }
    const executable = await this.detector.locate(this.kind);
    if (executable === null) {
      yield { type: 'failed', code: 'not_installed', message: `${this.kind} CLI is not installed` };
      return;
    }
    yield { type: 'started', runner: this.kind };
    const prompt = prepareTaskPrompt(request.input, {
      language: this.language,
      nonce: this.nonce(),
      thread: request.thread,
    });
    const workspace = await this.workspaces.create();
    try {
      yield* this.runWithRepair(request, executable, prompt, workspace);
    } finally {
      await workspace.dispose();
    }
  }

  private async *runWithRepair(
    request: AiRequest,
    executable: string,
    prompt: PreparedPrompt<AiOutput>,
    workspace: RunWorkspace,
  ): AsyncGenerator<AiEvent> {
    const deadline = Date.now() + request.timeoutMs;
    const first = yield* this.attempt(request, executable, prompt, workspace, deadline);
    if (!first.ok) {
      yield { type: 'failed', ...first.failure };
      return;
    }
    const parsed = prompt.parse(first.text);
    if (parsed.ok) {
      yield { type: 'completed', output: parsed.value };
      return;
    }
    const repairPrompt = prompt.repair(first.text, parsed.error);
    const second = yield* this.attempt(request, executable, repairPrompt, workspace, deadline);
    if (!second.ok) {
      yield { type: 'failed', ...second.failure };
      return;
    }
    const repaired = repairPrompt.parse(second.text);
    if (!repaired.ok) {
      yield { type: 'failed', code: 'invalid_output', message: repaired.error };
      return;
    }
    yield { type: 'completed', output: repaired.value };
  }

  private attempt(
    request: AiRequest,
    executable: string,
    prompt: PreparedPrompt<AiOutput>,
    workspace: RunWorkspace,
    deadline: number,
  ): AsyncGenerator<AiEvent, AttemptOutcome> {
    return runAttempt({
      dialect: this.dialect,
      launcher: this.launcher,
      executable,
      input: {
        system: prompt.system,
        prompt: prompt.text,
        tools: prompt.tools,
        mailTools: request.mailTools,
        workspace,
        model: request.model ?? null,
        effort: request.effort ?? null,
      },
      env: this.env,
      timeoutMs: Math.max(1, deadline - Date.now()),
      signal: request.signal,
    });
  }
}
