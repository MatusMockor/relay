import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface TaskAnswer {
  readonly when: string;
  readonly answer: string;
}

export interface StubClaudeByTask {
  readonly dir: string;
  prompts(): Promise<string[]>;
  dispose(): Promise<void>;
}

const script = (answers: readonly TaskAnswer[]): string => `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const dir = path.dirname(process.argv[1]);
if (args[0] === '--version') { process.stdout.write('2.1.0 (Claude Code)\\n'); process.exit(0); }
if (args[0] === 'auth') { process.stdout.write('{"loggedIn":true,"authMethod":"stub"}\\n'); process.exit(0); }
let prompt = '';
try { prompt = fs.readFileSync(0, 'utf8'); } catch {}
fs.appendFileSync(path.join(dir, 'prompts.jsonl'), JSON.stringify(prompt) + '\\n');
const answers = ${JSON.stringify(answers)};
const match = answers.find((entry) => prompt.includes(entry.when));
const answer = match === undefined ? 'no answer' : match.answer;
const session = 'stub-session';
const lines = [
  { type: 'system', subtype: 'init', session_id: session, tools: [], mcp_servers: [] },
  { type: 'assistant', session_id: session, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: answer }] } },
  { type: 'result', subtype: 'success', is_error: false, result: answer, session_id: session, num_turns: 1 },
];
for (const line of lines) process.stdout.write(JSON.stringify(line) + '\\n');
`;

export const installStubClaudeByTask = async (
  answers: readonly TaskAnswer[],
): Promise<StubClaudeByTask> => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-server-claude-task-'));
  const path = join(dir, 'claude');
  await writeFile(path, script(answers), 'utf8');
  await chmod(path, 0o755);
  return {
    dir,
    prompts: async () =>
      (await readFile(join(dir, 'prompts.jsonl'), 'utf8').catch(() => ''))
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as string),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
};

export const SUMMARY_TASK = 'Zhrň vlákno';
export const REPLY_TASK = 'Navrhni presne 3';
