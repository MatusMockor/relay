import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = String.raw`
const fs = process.getBuiltinModule('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('2.1.0 (Claude Code)\n');
  process.exit(0);
}
if (args[0] === 'auth') {
  process.stdout.write(JSON.stringify({ loggedIn: true }) + '\n');
  process.exit(0);
}
fs.readFileSync(0, 'utf8');
fs.appendFileSync(process.argv[1] + '.started', 'run\n');
setTimeout(() => {
  const result = JSON.stringify({ summary: 'Neskoro.', checklist: [] });
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result, session_id: 's1' }) + '\n');
}, 30000);
`;

export interface SlowClaude {
  readonly dir: string;
  readonly startedFile: string;
  dispose(): Promise<void>;
}

export const installSlowClaude = async (): Promise<SlowClaude> => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-slow-claude-'));
  const path = join(dir, 'claude');
  await writeFile(path, `#!${process.execPath}\n${SCRIPT}`);
  await chmod(path, 0o755);
  return {
    dir,
    startedFile: `${path}.started`,
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
};
