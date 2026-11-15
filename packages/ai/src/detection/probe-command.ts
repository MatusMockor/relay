import { execa } from 'execa';

export interface ProbeResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly output: string;
}

export async function runProbe(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<ProbeResult> {
  const result = await execa(executable, [...args], {
    timeout: timeoutMs,
    reject: false,
    stdin: 'ignore',
    all: true,
    env: { NO_COLOR: '1' },
  });
  return {
    ok: !result.failed,
    exitCode: result.exitCode ?? null,
    output: result.all.trim(),
  };
}
