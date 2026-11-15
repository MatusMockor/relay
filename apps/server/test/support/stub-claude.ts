import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface StubClaude {
  readonly dir: string;
  calls(): Promise<string[][]>;
  mcpConfigs(): Promise<string[]>;
  dispose(): Promise<void>;
}

const script = (answer: string): string => `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const dir = path.dirname(process.argv[1]);
if (args[0] === '--version') { process.stdout.write('2.1.0 (Claude Code)\\n'); process.exit(0); }
if (args[0] === 'auth') { process.stdout.write('{"loggedIn":true,"authMethod":"stub"}\\n'); process.exit(0); }
try { fs.readFileSync(0, 'utf8'); } catch {}
fs.appendFileSync(path.join(dir, 'calls.jsonl'), JSON.stringify(args) + '\\n');
const mcp = args.indexOf('--mcp-config');
if (mcp >= 0) { fs.appendFileSync(path.join(dir, 'mcp.jsonl'), JSON.stringify(fs.readFileSync(args[mcp + 1], 'utf8')) + '\\n'); }
const answer = ${JSON.stringify(answer)};
const session = 'stub-session';
const lines = [
  { type: 'system', subtype: 'init', session_id: session, tools: [], mcp_servers: [] },
  { type: 'assistant', session_id: session, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: answer }] } },
  { type: 'result', subtype: 'success', is_error: false, result: answer, session_id: session, num_turns: 1 },
];
for (const line of lines) process.stdout.write(JSON.stringify(line) + '\\n');
`;

const readLines = async (file: string): Promise<unknown[]> => {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
};

export const installStubClaude = async (answer: string): Promise<StubClaude> => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-server-claude-'));
  const path = join(dir, 'claude');
  await writeFile(path, script(answer), 'utf8');
  await chmod(path, 0o755);
  return {
    dir,
    calls: async () => (await readLines(join(dir, 'calls.jsonl'))) as string[][],
    mcpConfigs: async () => (await readLines(join(dir, 'mcp.jsonl'))) as string[],
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
};
