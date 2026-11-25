import type { CreateAiJobBody } from '@relay/shared/api';
import {
  type AiModelSelection,
  type AutomationId,
  DEFAULT_USER_SETTINGS,
  type MessageId,
  type ThreadId,
} from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const DEFAULT_MODEL: AiModelSelection = {
  runner: 'claude',
  model: 'claude-sonnet-5-5',
  effort: 'high',
};
const BACKGROUND_MODEL: AiModelSelection = {
  runner: 'codex',
  model: 'gpt-6-luna',
  effort: 'low',
};

const configuredEngine = async (): Promise<{ engine: TestEngine; threadId: ThreadId }> => {
  const engine = createTestEngine({ ai: { oneLinersPerSync: 0 } });
  await engine.services.settings.update(USER_ID, {
    ai: { defaultModel: DEFAULT_MODEL, backgroundModel: BACKGROUND_MODEL },
  });
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'm1', subject: 'Invoice 42', body: 'Please pay by Friday' });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return { engine, threadId: present(page.items[0]).id };
};

const jobSelection = async (
  engine: TestEngine,
  body: CreateAiJobBody,
): Promise<AiModelSelection> => {
  const job = await engine.services.ai.createJob(USER_ID, body);
  return { runner: job.runner, model: job.model ?? null, effort: job.effort ?? null };
};

describe('AI job model defaults', () => {
  it('runs one-liners and automation task verdicts on the background model', async () => {
    const { engine, threadId } = await configuredEngine();

    expect(await jobSelection(engine, { input: { kind: 'oneLiner', threadId } })).toEqual(
      BACKGROUND_MODEL,
    );
    const verdict = await jobSelection(engine, {
      input: {
        kind: 'automationTask',
        threadId,
        messageId: 'msg_1' as MessageId,
        automationId: 'aut_1' as AutomationId,
        instructions: 'Len ak treba niečo urobiť',
        jiraKey: 'REL-1',
      },
      runner: 'codex',
      model: null,
      effort: null,
    });
    expect(verdict).toEqual(BACKGROUND_MODEL);
  });

  it('runs summaries, reply suggestions and chat on the default model', async () => {
    const { engine, threadId } = await configuredEngine();

    expect(await jobSelection(engine, { input: { kind: 'summary', threadId } })).toEqual(
      DEFAULT_MODEL,
    );
    expect(await jobSelection(engine, { input: { kind: 'replySuggestions', threadId } })).toEqual(
      DEFAULT_MODEL,
    );
    const chat = await jobSelection(engine, {
      input: { kind: 'chatAnswer', question: 'Čo dnes?', threadId: null, history: [] },
      runner: 'claude',
    });
    expect(chat).toEqual(DEFAULT_MODEL);
  });

  it('keeps an explicit model and effort from the request', async () => {
    const { engine, threadId } = await configuredEngine();

    const explicit = await jobSelection(engine, {
      input: { kind: 'oneLiner', threadId },
      runner: 'claude',
      model: 'claude-opus-5-5',
      effort: 'max',
    });

    expect(explicit).toEqual({ runner: 'claude', model: 'claude-opus-5-5', effort: 'max' });
  });

  it('never applies the model of another runner when the request picks only a runner', async () => {
    const { engine, threadId } = await configuredEngine();

    const summary = await jobSelection(engine, {
      input: { kind: 'summary', threadId },
      runner: 'codex',
    });
    const oneLiner = await jobSelection(engine, {
      input: { kind: 'oneLiner', threadId },
      runner: 'claude',
    });

    expect(summary).toEqual({ runner: 'codex', model: null, effort: null });
    expect(oneLiner).toEqual({ runner: 'claude', model: null, effort: null });
  });

  it('drops a saved model that the catalog no longer knows', async () => {
    const { engine, threadId } = await configuredEngine();
    await engine.repositories.settings.save(USER_ID, {
      ...DEFAULT_USER_SETTINGS,
      ai: {
        ...DEFAULT_USER_SETTINGS.ai,
        defaultModel: { runner: 'codex', model: 'gpt-retired', effort: 'high' },
      },
    });

    expect(await jobSelection(engine, { input: { kind: 'summary', threadId } })).toEqual({
      runner: 'codex',
      model: null,
      effort: null,
    });
  });
});
