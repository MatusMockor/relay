import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const SCRIPT = String.raw`
const fs = process.getBuiltinModule('node:fs');
const self = process.argv[1];
const args = process.argv.slice(2);
if (args[0] === '--version') {
  process.stdout.write('2.1.0 (Claude Code)\n');
  process.exit(0);
}
if (args[0] === 'auth') {
  process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' }) + '\n');
  process.exit(0);
}
const stdin = fs.readFileSync(0, 'utf8');
const configIndex = args.indexOf('--mcp-config');
const mcpConfig = configIndex >= 0 ? fs.readFileSync(args[configIndex + 1], 'utf8') : null;
fs.appendFileSync(self + '.calls.jsonl', JSON.stringify({ args, stdin, mcpConfig }) + '\n');
const answer = stdin.includes('Prepíš')
  ? { text: 'Dobrý deň, ďakujem za správu.' }
  : stdin.includes('vytvor jednu úlohu')
    ? { title: 'Skontrolovať faktúru', what: 'Skontrolovať faktúru za október do piatka.' }
    : stdin.includes('Navrhni presne 3')
      ? {
          suggestions: [
            { label: 'Zaplatím', body: 'Ďakujem, faktúru uhradím do piatka.' },
            { label: 'Mám otázku', body: 'Môžete poslať rozpis položiek?' },
            { label: 'Neskôr', body: 'Pozriem sa na to budúci týždeň.' },
          ],
        }
      : { summary: 'Jana posiela faktúru za október.', checklist: ['Skontrolovať faktúru'] };
const lines = [
  { type: 'system', subtype: 'init', session_id: 's1', tools: [], mcp_servers: [] },
  { type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(answer), session_id: 's1' },
];
for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n');
`;

const StubCallSchema = z.object({
  args: z.array(z.string()),
  stdin: z.string(),
  mcpConfig: z.string().nullable(),
});
export type StubClaudeCall = z.infer<typeof StubCallSchema>;

export interface StubClaude {
  readonly dir: string;
  calls(): Promise<StubClaudeCall[]>;
  dispose(): Promise<void>;
}

export const installStubClaude = async (): Promise<StubClaude> => {
  const dir = await mkdtemp(join(tmpdir(), 'relay-desktop-claude-'));
  const path = join(dir, 'claude');
  await writeFile(path, `#!${process.execPath}\n${SCRIPT}`);
  await chmod(path, 0o755);
  return {
    dir,
    calls: async () => {
      const raw = await readFile(`${path}.calls.jsonl`, 'utf8').catch(() => '');
      return raw
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => StubCallSchema.parse(JSON.parse(line)));
    },
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
};
