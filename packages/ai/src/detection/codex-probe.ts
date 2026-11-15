import { firstLine, type AuthVerdict, type CliProbe } from './cli-probe';
import type { ProbeResult } from './probe-command';

export const codexProbe: CliProbe = {
  runner: 'codex',
  executableName: 'codex',
  versionArgs: ['--version'],
  authArgs: ['login', 'status'],
  parseAuth: parseCodexAuth,
};

function parseCodexAuth(result: ProbeResult): AuthVerdict {
  const detail = firstLine(result.output);
  if (/not logged in|no credentials|logged out/i.test(result.output)) {
    return { authenticated: false, detail };
  }
  if (result.ok && /logged in/i.test(result.output)) {
    return { authenticated: true, detail };
  }
  return { authenticated: 'unknown', detail };
}
