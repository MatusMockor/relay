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
const answer = stdin.includes('Prepíš')
  ? { text: 'Dobrý deň, ďakujem za správu.' }
  : stdin.includes('rovno povie podstatu mailu')
    ? { text: 'Jana posiela faktúru za október.' }
    : stdin.includes('vytvor jednu úlohu')
      ? { title: 'Skontrolovať faktúru', what: 'Skontrolovať faktúru za október do piatka.' }
      : stdin.includes('návrh pravidla automatizácie')
        ? {
            name: 'Faktúry',
            accountId: null,
            match: 'all',
            conditions: [{ type: 'hasAttachment' }],
            exceptions: [],
            actions: [{ type: 'addLabel', label: 'faktury' }, { type: 'archive' }],
            understood: 'Maily s prílohou dostanú štítok Faktúry a archivujú sa.',
            unmapped: ['od dodávateľov'],
          }
      : stdin.includes('Navrhni presne 3')
        ? {
            suggestions: [
              { label: 'Zaplatím', body: 'Ďakujem, faktúru uhradím do piatka.' },
              { label: 'Mám otázku', body: 'Môžete poslať rozpis položiek?' },
              { label: 'Neskôr', body: 'Pozriem sa na to budúci týždeň.' },
            ],
          }
        : { summary: 'Jana posiela faktúru za október.', checklist: ['Skontrolovať faktúru'] };
const httpServer = (() => {
  try {
    const servers = Object.values(JSON.parse(mcpConfig ?? '{}').mcpServers ?? {});
    return servers.find((server) => server !== null && server.type === 'http') ?? null;
  } catch {
    return null;
  }
})();
const probeMcp = () =>
  httpServer === null
    ? Promise.resolve(null)
    : fetch(httpServer.url, {
        method: 'POST',
        headers: {
          ...httpServer.headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'stub-claude', version: '1.0.0' },
          },
        }),
      }).then(
        (response) => response.status,
        () => 0,
      );
const lines = [
  { type: 'system', subtype: 'init', session_id: 's1', tools: [], mcp_servers: [] },
  { type: 'result', subtype: 'success', is_error: false, result: JSON.stringify(answer), session_id: 's1' },
];
void probeMcp().then((mcpStatus) => {
  fs.appendFileSync(self + '.calls.jsonl', JSON.stringify({ args, stdin, mcpConfig, mcpStatus }) + '\n');
  for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n');
});
`;

const StubCallSchema = z.object({
  args: z.array(z.string()),
  stdin: z.string(),
  mcpConfig: z.string().nullable(),
  mcpStatus: z.number().int().nullable(),
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
