import { ThreadIdSchema, type AiEvent } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeCodeRunner } from '../src/runners/claude/claude-code-runner';
import { claudeStarted } from './fixtures/claude-streams';
import { aiRequest, collect, stubDetector } from './support/ai-request';
import { createStubBin, type StubBin } from './support/stub-cli';

const input = { kind: 'oneLiner' as const, threadId: ThreadIdSchema.parse('thr_1') };

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

describe('CLI run lifecycle', () => {
  let bin: StubBin;
  let runner: ClaudeCodeRunner;

  beforeEach(async () => {
    bin = await createStubBin();
    await bin.install('claude', { responses: [{ lines: claudeStarted(), hangMs: 60_000 }] });
    runner = new ClaudeCodeRunner({ location: 'local', detector: stubDetector(bin.dir) });
  });

  afterEach(async () => {
    await bin.dispose();
  });

  it('kills the CLI process when the AbortSignal fires', async () => {
    const controller = new AbortController();
    const events: AiEvent[] = [];
    for await (const event of runner.run(aiRequest(input, { signal: controller.signal }))) {
      events.push(event);
      if (event.type === 'delta') {
        controller.abort();
      }
    }

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'cancelled' });
    const [call] = await bin.calls('claude');
    expect(isAlive(call?.pid ?? 0)).toBe(false);
  });

  it('kills the CLI process and reports timeout when the run takes too long', async () => {
    const events = await collect(runner.run(aiRequest(input, { timeoutMs: 500 })));

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'timeout' });
    const [call] = await bin.calls('claude');
    expect(isAlive(call?.pid ?? 0)).toBe(false);
  });

  it('kills the CLI process when the consumer stops iterating', async () => {
    for await (const event of runner.run(aiRequest(input))) {
      if (event.type === 'delta') {
        break;
      }
    }

    const [call] = await bin.calls('claude');
    await expect.poll(() => isAlive(call?.pid ?? 0), { timeout: 5_000 }).toBe(false);
  });

  it('also terminates processes the CLI spawned', async () => {
    await bin.install('claude', {
      responses: [{ lines: claudeStarted(), hangMs: 60_000, spawnChild: true }],
    });

    const events = await collect(runner.run(aiRequest(input, { timeoutMs: 800 })));

    expect(events.at(-1)).toMatchObject({ type: 'failed', code: 'timeout' });
    const childPid = await bin.childPid('claude');
    await expect.poll(() => isAlive(childPid), { timeout: 5_000 }).toBe(false);
  });

  it('does not spawn anything for an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();

    const events = await collect(runner.run(aiRequest(input, { signal: controller.signal })));

    expect(events).toEqual([
      { type: 'failed', code: 'cancelled', message: 'AI run was cancelled' },
    ]);
    expect(await bin.calls('claude')).toEqual([]);
  });
});
