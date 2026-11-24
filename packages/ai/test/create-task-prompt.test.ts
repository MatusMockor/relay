import { ThreadIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import type { PromptContext } from '../src/prompts/prompt-spec';
import { prepareTaskPrompt } from '../src/prompts/task-prompts';
import { threadFixture } from './support/thread-fixture';

const threadId = ThreadIdSchema.parse('thr_1');

const promptIn = (language: PromptContext['language']) =>
  prepareTaskPrompt(
    { kind: 'createTask', threadId, hint: null },
    { language, nonce: 'abc123', thread: threadFixture() },
  );

const answer = (priority: string): string =>
  JSON.stringify({ title: 'Opraviť výpadok', what: 'Dnes do 12:00.', priority });

describe('createTask prompt priority', () => {
  it('asks the model for a priority from the urgency signals of the mail', () => {
    expect(promptIn('sk').text).toContain('priority urč podľa naliehavosti v maile');
    expect(promptIn('en').text).toContain('Pick priority from the urgency in the mail');
    expect(promptIn('sk').text).toContain('"enum":["urgent","high","medium","low","none"]');
  });

  it('maps every suggested priority onto the task output', () => {
    const prompt = promptIn('sk');

    expect(prompt.parse(answer('urgent'))).toMatchObject({
      ok: true,
      value: { kind: 'createTask', threadId, title: 'Opraviť výpadok', priority: 'urgent' },
    });
    expect(prompt.parse(answer('high'))).toMatchObject({ ok: true, value: { priority: 'high' } });
    expect(prompt.parse(answer('medium'))).toMatchObject({
      ok: true,
      value: { priority: 'medium' },
    });
    expect(prompt.parse(answer('low'))).toMatchObject({ ok: true, value: { priority: 'low' } });
  });

  it('falls back to none when the priority is missing or invalid', () => {
    const prompt = promptIn('sk');

    expect(prompt.parse(answer('asap'))).toMatchObject({ ok: true, value: { priority: 'none' } });
    expect(prompt.parse('{"title":"Zavolať","what":"Zavolať Jane."}')).toMatchObject({
      ok: true,
      value: { priority: 'none' },
    });
  });
});
