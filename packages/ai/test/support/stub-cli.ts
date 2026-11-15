import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export interface StubResponse {
  readonly lines: readonly unknown[];
  readonly exitCode?: number;
  readonly stderr?: string;
  readonly hangMs?: number;
  readonly lineDelayMs?: number;
  readonly spawnChild?: boolean | 'stubborn';
  readonly termDelayMs?: number;
}

export interface StubSpec {
  readonly version?: string;
  readonly auth?: { readonly output: string; readonly exitCode: number };
  readonly responses?: readonly StubResponse[];
}

const StubCallSchema = z.object({
  pid: z.number().int(),
  args: z.array(z.string()),
  stdin: z.string(),
  cwd: z.string(),
  env: z.object({
    RELAY_MAIL_MCP_BEARER_TOKEN: z.string().nullable(),
    RELAY_TEST_EXTRA: z.string().nullable(),
    RELAY_MAIL_MCP_TOKEN: z.string().nullable(),
    RELAY_MAIL_MCP_HEADER_1: z.string().nullable(),
  }),
  mcpConfig: z.string().nullable(),
});
export type StubCall = z.infer<typeof StubCallSchema>;

export interface StubBin {
  readonly dir: string;
  install(name: 'claude' | 'codex', spec: StubSpec): Promise<string>;
  calls(name: 'claude' | 'codex'): Promise<StubCall[]>;
  childPid(name: 'claude' | 'codex'): Promise<number>;
  dispose(): Promise<void>;
}

const STUB_SOURCE = new URL('../fixtures/stub-cli.cjs', import.meta.url);

export async function createStubBin(): Promise<StubBin> {
  const dir = await mkdtemp(join(tmpdir(), 'relay-ai-stub-'));
  const source = await readFile(STUB_SOURCE, 'utf8');
  return {
    dir,
    install: async (name, spec) => {
      const path = join(dir, name);
      await writeFile(path, `#!${process.execPath}\n${source}`);
      await chmod(path, 0o755);
      await writeFile(`${path}.config.json`, JSON.stringify(spec));
      return path;
    },
    calls: async (name) => {
      const raw = await readFile(join(dir, `${name}.calls.jsonl`), 'utf8').catch(() => '');
      return raw
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => StubCallSchema.parse(JSON.parse(line)));
    },
    childPid: async (name) => Number(await readFile(join(dir, `${name}.child.pid`), 'utf8')),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}
