import { existsSync } from 'node:fs';
import { ThreadIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeCodeRunner } from '../src/runners/claude/claude-code-runner';
import {
  claudeInterrupted,
  claudeNotLoggedIn,
  claudePlainAnswer,
  claudeToolThenAnswer,
} from './fixtures/claude-streams';
import { aiRequest, collect, STDIO_TOOLS, stubDetector } from './support/ai-request';
import { createStubBin, type StubBin } from './support/stub-cli';
import { INJECTION, threadFixture } from './support/thread-fixture';

const threadId = ThreadIdSchema.parse('thr_1');
const summaryAnswer =
  '{"summary":"Jana žiada cenovú ponuku do piatku.","checklist":["Poslať ponuku"]}';

describe('ClaudeCodeRunner', () => {
  let bin: StubBin;
  let runner: ClaudeCodeRunner;

  beforeEach(async () => {
    bin = await createStubBin();
    runner = new ClaudeCodeRunner({
      location: 'local',
      detector: stubDetector(bin.dir),
      nonce: () => 'nonce42',
      model: 'sonnet',
    });
  });

  afterEach(async () => {
    await bin.dispose();
  });

  it('runs with the model of the request instead of the configured one', async () => {
    await bin.install('claude', { responses: [{ lines: claudeToolThenAnswer(summaryAnswer, 5) }] });

    await collect(
      runner.run(
        aiRequest({ kind: 'summary', threadId }, { thread: threadFixture(), model: 'opus' }),
      ),
    );

    const [call] = await bin.calls('claude');
    expect(call?.args[call.args.indexOf('--model') + 1]).toBe('opus');
    expect(call?.args).not.toContain('sonnet');
  });

  it('maps stream-json events to AI events and parses the final JSON', async () => {
    await bin.install('claude', {
      responses: [{ lines: claudeToolThenAnswer(summaryAnswer, 20) }],
    });

    const events = await collect(
      runner.run(aiRequest({ kind: 'summary', threadId }, { thread: threadFixture() })),
    );

    expect(events).toEqual([
      { type: 'started', runner: 'claude' },
      { type: 'toolCall', name: 'get_thread' },
      { type: 'delta', text: summaryAnswer.slice(0, 20) },
      { type: 'delta', text: summaryAnswer.slice(20) },
      {
        type: 'completed',
        output: {
          kind: 'summary',
          summary: 'Jana žiada cenovú ponuku do piatku.',
          checklist: [{ id: 'check-1', text: 'Poslať ponuku', done: false }],
        },
      },
    ]);
  });

  it('spawns claude -p with stream-json, the mail MCP config and only mail tools', async () => {
    await bin.install('claude', { responses: [{ lines: claudeToolThenAnswer(summaryAnswer, 5) }] });

    await collect(
      runner.run(aiRequest({ kind: 'summary', threadId }, { thread: threadFixture() })),
    );

    const [call] = await bin.calls('claude');
    expect(call?.args.slice(0, 5)).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]);
    expect(call?.args).toEqual(
      expect.arrayContaining(['--strict-mcp-config', '--model', 'sonnet']),
    );
    expect(call?.args[call.args.indexOf('--tools') + 1]).toBe('');
    expect(call?.args[call.args.indexOf('--allowedTools') + 1]).toBe(
      'mcp__mail__search_threads,mcp__mail__list_folder,mcp__mail__get_thread,mcp__mail__list_tasks,mcp__mail__list_events,mcp__mail__get_thread_events',
    );
    expect(JSON.parse(call?.mcpConfig ?? '{}')).toEqual({
      mcpServers: {
        mail: {
          type: 'stdio',
          command: STDIO_TOOLS.command,
          args: STDIO_TOOLS.args,
          env: STDIO_TOOLS.env,
        },
      },
    });
    expect(call?.stdin).toContain(`<<<UNTRUSTED_nonce42>>>\nthread_id: thr_1`);
    expect(call?.stdin).toContain(INJECTION);
    expect(call?.stdin.indexOf(INJECTION)).toBeGreaterThan(
      call?.stdin.indexOf('<<<UNTRUSTED_nonce42>>>') ?? 0,
    );
    expect(existsSync(call?.cwd ?? '')).toBe(false);
  });

  it('passes the HTTP endpoint with headers in the MCP config file', async () => {
    await bin.install('claude', {
      responses: [{ lines: claudePlainAnswer('{"text":"Chce ponuku."}') }],
    });
    const mailTools = {
      transport: 'http' as const,
      command: null,
      args: [],
      url: 'https://relay.example.com/mcp',
      headers: { Authorization: 'Bearer srv-token' },
    };

    const events = await collect(
      runner.run(aiRequest({ kind: 'oneLiner', threadId }, { mailTools })),
    );

    const [call] = await bin.calls('claude');
    expect(JSON.parse(call?.mcpConfig ?? '{}')).toEqual({
      mcpServers: { mail: { type: 'http', url: mailTools.url, headers: mailTools.headers } },
    });
    expect(call?.stdin).toContain('get_thread s thread_id "thr_1"');
    expect(events.at(-1)).toEqual({
      type: 'completed',
      output: { kind: 'oneLiner', text: 'Chce ponuku.' },
    });
  });

  it('retries once with a repair prompt when the answer is not valid JSON', async () => {
    await bin.install('claude', {
      responses: [
        { lines: claudePlainAnswer('Jasné! Tu je jedna veta: Chce ponuku.') },
        { lines: claudePlainAnswer('```json\n{"text":"Chce cenovú ponuku."}\n```') },
      ],
    });

    const events = await collect(runner.run(aiRequest({ kind: 'oneLiner', threadId })));

    expect(events.at(-1)).toEqual({
      type: 'completed',
      output: { kind: 'oneLiner', text: 'Chce cenovú ponuku.' },
    });
    const calls = await bin.calls('claude');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).not.toContain('--mcp-config');
    expect(calls[1]?.stdin).toContain('nebola platný JSON');
    expect(calls[1]?.stdin).toContain('<<<UNTRUSTED_nonce42>>>\nJasné! Tu je jedna veta');
  });

  it('fails with invalid_output when the repaired answer is still invalid', async () => {
    await bin.install('claude', {
      responses: [
        { lines: claudePlainAnswer('{"text":""}') },
        { lines: claudePlainAnswer('{"wrong":1}') },
      ],
    });

    const events = await collect(runner.run(aiRequest({ kind: 'oneLiner', threadId })));

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'invalid_output' });
  });

  it('reports a missing login as not_authenticated', async () => {
    await bin.install('claude', { responses: [{ lines: claudeNotLoggedIn(), exitCode: 1 }] });

    const events = await collect(runner.run(aiRequest({ kind: 'oneLiner', threadId })));

    const last = events.at(-1);
    expect(last).toMatchObject({ type: 'failed', code: 'not_authenticated' });
    expect(last?.type === 'failed' ? last.message : '').toContain('Not logged in');
  });

  it('reports an interrupted stream with stderr as process_failed', async () => {
    await bin.install('claude', {
      responses: [{ lines: claudeInterrupted(), exitCode: 1, stderr: 'Error: socket hang up' }],
    });

    const events = await collect(runner.run(aiRequest({ kind: 'oneLiner', threadId })));

    expect(events).toContainEqual({ type: 'delta', text: '{"summary":"Klient' });
    expect(events.at(-1)).toEqual({
      type: 'failed',
      code: 'process_failed',
      message: 'Error: socket hang up',
    });
  });

  it('reports a missing CLI as not_installed without starting', async () => {
    const events = await collect(runner.run(aiRequest({ kind: 'oneLiner', threadId })));

    expect(events).toEqual([
      { type: 'failed', code: 'not_installed', message: 'claude CLI is not installed' },
    ]);
  });
});
