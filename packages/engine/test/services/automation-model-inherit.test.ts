import type { AiModelSelection, AutomationAi } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  addAutomations,
  automationInput,
  jobsOf,
  sync,
  syncedSetup,
  TIBOR,
} from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const BACKGROUND_CODEX: AiModelSelection = { runner: 'codex', model: 'gpt-6-luna', effort: 'low' };

const queuedTaskSelection = async (ai: AutomationAi) => {
  const setup = await syncedSetup();
  await setup.engine.services.settings.update(USER_ID, {
    ai: { backgroundModel: BACKGROUND_CODEX },
  });
  await addAutomations(setup.engine, [automationInput({ actions: [{ type: 'task' }], ai })]);
  deliverMail(setup.server, 'INBOX', { id: 'm1', from: TIBOR, subject: 'Ponuka' });
  await sync(setup);
  return jobsOf(setup.engine, 'automationTask').map((job) => ({
    runner: job.runner,
    model: job.model ?? null,
    effort: job.effort ?? null,
  }));
};

describe('automation AI model', () => {
  it('runs a rule without its own model on the background model from settings', async () => {
    const selections = await queuedTaskSelection({
      runner: 'claude',
      model: null,
      effort: null,
      instructions: 'Task iba ak odo mňa niečo chce.',
    });

    expect(selections).toEqual([BACKGROUND_CODEX]);
  });

  it('keeps the explicit model of a rule', async () => {
    const selections = await queuedTaskSelection({
      runner: 'claude',
      model: 'claude-sonnet-5-5',
      effort: 'high',
      instructions: null,
    });

    expect(selections).toEqual([{ runner: 'claude', model: 'claude-sonnet-5-5', effort: 'high' }]);
  });
});
