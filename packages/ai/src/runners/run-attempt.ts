import type { AiEvent } from '@relay/shared/domain';
import type { CliLauncher } from '../process/cli-process';
import type { CliDialect, CliFailure, DialectRunInput } from './cli-dialect';

export type AttemptOutcome =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly failure: CliFailure };

export interface AttemptParams {
  readonly dialect: CliDialect;
  readonly launcher: CliLauncher;
  readonly executable: string;
  readonly input: DialectRunInput;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | null;
}

export async function* runAttempt(params: AttemptParams): AsyncGenerator<AiEvent, AttemptOutcome> {
  const invocation = await prepareInvocation(params);
  if (!invocation.ok) {
    return invocation;
  }
  const subprocess = params.launcher.launch({
    executable: params.executable,
    args: invocation.value.args,
    stdin: invocation.value.stdin,
    cwd: params.input.workspace.dir,
    env: { ...params.env, ...invocation.value.env },
    timeoutMs: params.timeoutMs,
    signal: params.signal,
  });
  const mapper = params.dialect.createMapper();
  let finalText: string | null = null;
  let lastError: string | null = null;
  for await (const line of subprocess.lines) {
    for (const signal of mapper.map(parseJsonLine(line))) {
      if (signal.type === 'event') {
        yield signal.event;
      }
      if (signal.type === 'final') {
        finalText = signal.text;
      }
      if (signal.type === 'error') {
        lastError = signal.message;
      }
    }
  }
  const exit = await subprocess.exit;
  if (finalText !== null && exit.reason === 'exited' && exit.exitCode === 0) {
    return { ok: true, text: finalText };
  }
  return { ok: false, failure: params.dialect.classifyFailure(exit, lastError) };
}

async function prepareInvocation(params: AttemptParams) {
  try {
    return { ok: true as const, value: await params.dialect.prepare(params.input) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not prepare the CLI run';
    return { ok: false as const, failure: { code: 'process_failed' as const, message } };
  }
}

function parseJsonLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch (_error) {
    return null;
  }
}
