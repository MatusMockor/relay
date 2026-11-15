import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const stubCli = new URL('./fixtures/stub-cli.mjs', import.meta.url).pathname;

const StreamLineSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('system'), subtype: z.string(), model: z.string() }),
  z.object({ type: z.literal('assistant'), text: z.string() }),
  z.object({ type: z.literal('result'), subtype: z.literal('success'), result: z.string() }),
]);

describe('stub CLI harness', () => {
  it('spawns a stub executable and validates its JSON lines output', async () => {
    const { stdout, exitCode } = await execa(process.execPath, [stubCli, 'zhrň', 'vlákno'], {
      timeout: 10_000,
    });
    expect(exitCode).toBe(0);
    const lines = stdout.split('\n').map((line) => StreamLineSchema.parse(JSON.parse(line)));
    expect(lines.at(-1)).toEqual({
      type: 'result',
      subtype: 'success',
      result: 'echo: zhrň vlákno',
    });
  });
});
