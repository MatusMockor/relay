import { z } from 'zod';
import { firstLine, type AuthVerdict, type CliProbe } from './cli-probe';
import type { ProbeResult } from './probe-command';

const ClaudeAuthStatusSchema = z.object({
  loggedIn: z.boolean(),
  authMethod: z.string().optional(),
});

export const claudeProbe: CliProbe = {
  runner: 'claude',
  executableName: 'claude',
  versionArgs: ['--version'],
  authArgs: ['auth', 'status', '--json'],
  parseAuth: parseClaudeAuth,
};

function parseClaudeAuth(result: ProbeResult): AuthVerdict {
  const status = parseStatusJson(result.output);
  if (status !== null) {
    return {
      authenticated: status.loggedIn,
      detail: status.authMethod ?? (status.loggedIn ? 'logged in' : 'not logged in'),
    };
  }
  if (/not logged in|please run .*login/i.test(result.output)) {
    return { authenticated: false, detail: firstLine(result.output) };
  }
  return { authenticated: 'unknown', detail: firstLine(result.output) };
}

function parseStatusJson(output: string): z.infer<typeof ClaudeAuthStatusSchema> | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = ClaudeAuthStatusSchema.safeParse(JSON.parse(output.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch (_error) {
    return null;
  }
}
