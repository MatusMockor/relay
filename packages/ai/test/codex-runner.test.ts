import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CODEX_MCP_BEARER_ENV } from '../src/runners/codex/codex-mcp-overrides';
import { CodexRunner } from '../src/runners/codex/codex-runner';
import {
  codexToolThenAnswer,
  codexTransientErrorThenAnswer,
  codexUnauthorized,
} from './fixtures/codex-streams';
import { aiRequest, collect, STDIO_TOOLS, stubDetector } from './support/ai-request';
import { createStubBin, type StubBin } from './support/stub-cli';

const chatInput = {
  kind: 'chatAnswer' as const,
  question: 'Ktoré faktúry sú nezaplatené?',
  threadId: null,
  history: [],
};
const chatAnswer = '{"text":"Nezaplatená je faktúra [thread:thr_9].","threadIds":["thr_9"]}';

describe('CodexRunner', () => {
  let bin: StubBin;
  let runner: CodexRunner;

  beforeEach(async () => {
    bin = await createStubBin();
    runner = new CodexRunner({
      location: 'server',
      detector: stubDetector(bin.dir),
      nonce: () => 'n0nce',
      env: { RELAY_TEST_EXTRA: 'yes' },
    });
  });

  afterEach(async () => {
    await bin.dispose();
  });

  it('maps codex exec JSONL events to AI events', async () => {
    await bin.install('codex', { responses: [{ lines: codexToolThenAnswer(chatAnswer) }] });

    const events = await collect(runner.run(aiRequest(chatInput, { runner: 'codex' })));

    expect(events).toEqual([
      { type: 'started', runner: 'codex' },
      { type: 'toolCall', name: 'search_threads' },
      { type: 'delta', text: chatAnswer },
      {
        type: 'completed',
        output: {
          kind: 'chatAnswer',
          text: 'Nezaplatená je faktúra [thread:thr_9].',
          references: ['thr_9'],
        },
      },
    ]);
  });

  it('runs a read-only codex exec with the mail MCP server configured via -c overrides', async () => {
    await bin.install('codex', { responses: [{ lines: codexToolThenAnswer(chatAnswer) }] });

    await collect(runner.run(aiRequest(chatInput, { runner: 'codex' })));

    const [call] = await bin.calls('codex');
    const args = call?.args ?? [];
    expect(args.slice(0, 4)).toEqual(['exec', '--json', '--sandbox', 'read-only']);
    expect(args).toEqual(
      expect.arrayContaining(['--ephemeral', '--ignore-user-config', '--skip-git-repo-check']),
    );
    expect(args.at(-1)).toBe('-');
    const overrides = args.filter((_arg, index) => args[index - 1] === '-c');
    expect(overrides).toEqual(
      expect.arrayContaining([
        'features.shell_tool=false',
        'features.unified_exec=false',
        'features.view_image=false',
        'web_search="disabled"',
      ]),
    );
    expect(args).toEqual(
      expect.arrayContaining([
        `mcp_servers.mail.command="${STDIO_TOOLS.command ?? ''}"`,
        'mcp_servers.mail.args=["/opt/relay/mcp.js", "--socket", "/tmp/relay.sock"]',
        'mcp_servers.mail.env_vars=["RELAY_MAIL_MCP_TOKEN"]',
        'mcp_servers.mail.enabled_tools=["search_threads", "list_folder", "get_thread", "list_tasks", "create_task", "create_draft"]',
      ]),
    );
    expect(args[args.indexOf('--cd') + 1]).toBe(call?.cwd);
    expect(call?.stdin.startsWith('Si asistent e-mailového klienta Relay')).toBe(true);
    expect(call?.stdin).toContain('Otázka používateľa: Ktoré faktúry sú nezaplatené?');
    expect(call?.env.RELAY_TEST_EXTRA).toBe('yes');
    expect(call?.env.RELAY_MAIL_MCP_TOKEN).toBe('local-secret');
    expect(args.join(' ')).not.toContain('local-secret');
  });

  it('moves a bearer header of an HTTP endpoint into an environment variable', async () => {
    await bin.install('codex', { responses: [{ lines: codexToolThenAnswer(chatAnswer) }] });
    const mailTools = {
      transport: 'http' as const,
      command: null,
      args: [],
      url: 'http://127.0.0.1:3000/mcp',
      headers: { Authorization: 'Bearer user-token', 'X-Relay-Device': 'dev_1' },
    };

    await collect(runner.run(aiRequest(chatInput, { runner: 'codex', mailTools })));

    const [call] = await bin.calls('codex');
    const joined = call?.args.join(' ') ?? '';
    expect(joined).toContain('mcp_servers.mail.url="http://127.0.0.1:3000/mcp"');
    expect(joined).toContain(
      'mcp_servers.mail.env_http_headers={ "X-Relay-Device" = "RELAY_MAIL_MCP_HEADER_1" }',
    );
    expect(joined).not.toContain('dev_1');
    expect(call?.env.RELAY_MAIL_MCP_HEADER_1).toBe('dev_1');
    expect(joined).toContain(`mcp_servers.mail.bearer_token_env_var="${CODEX_MCP_BEARER_ENV}"`);
    expect(joined).not.toContain('user-token');
    expect(call?.env.RELAY_MAIL_MCP_BEARER_TOKEN).toBe('user-token');
  });

  it('ignores transient error events when the turn completes', async () => {
    await bin.install('codex', {
      responses: [{ lines: codexTransientErrorThenAnswer(chatAnswer) }],
    });

    const events = await collect(runner.run(aiRequest(chatInput, { runner: 'codex' })));

    expect(events.at(-1)).toMatchObject({ type: 'completed' });
  });

  it('reports an unauthorized turn as not_authenticated', async () => {
    await bin.install('codex', { responses: [{ lines: codexUnauthorized(), exitCode: 1 }] });

    const events = await collect(runner.run(aiRequest(chatInput, { runner: 'codex' })));

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'not_authenticated' });
  });

  it('fails when the turn ends without an agent message', async () => {
    await bin.install('codex', {
      responses: [{ lines: [{ type: 'turn.started' }, { type: 'turn.completed', usage: {} }] }],
    });

    const events = await collect(runner.run(aiRequest(chatInput, { runner: 'codex' })));

    expect(events.at(-1)).toEqual({
      type: 'failed',
      code: 'process_failed',
      message: 'Codex finished the turn without an agent message',
    });
  });
});
