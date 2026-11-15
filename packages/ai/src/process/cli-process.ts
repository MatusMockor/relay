export interface CliInvocation {
  readonly executable: string;
  readonly args: readonly string[];
  readonly stdin: string;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | null;
}

export type CliExitReason = 'exited' | 'timeout' | 'cancelled' | 'not_found' | 'spawn_failed';

export interface CliExit {
  readonly reason: CliExitReason;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly message: string;
}

export interface CliProcess {
  readonly lines: AsyncIterable<string>;
  readonly exit: Promise<CliExit>;
}

export interface CliLauncher {
  launch(invocation: CliInvocation): CliProcess;
}
