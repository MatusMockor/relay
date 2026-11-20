import type { AutomationInput, ReplaceAutomationsBody } from '@relay/shared/api';
import {
  type AiJob,
  type Automation,
  supportedAutomations,
  type ThreadId,
  type UserId,
} from '@relay/shared/domain';
import { expect } from 'vitest';
import { StubAiRunner } from './fakes/stub-ai-runner';
import { seedAccount, type SeededAccount } from './fixtures';
import { createTestEngine, type TestEngine, USER_ID } from './test-engine';

export const JIRA = { name: 'Jira', email: 'jira@company.atlassian.test' };
export const TIBOR = { name: 'Tibor Hrasko', email: 'tibor@efabrica.test' };

export interface AutomationSetup extends SeededAccount {
  readonly engine: TestEngine;
  readonly codex: StubAiRunner;
}

export const automationInput = (overrides: Partial<AutomationInput> = {}): AutomationInput => ({
  accountId: null,
  name: 'Od Tibora',
  enabled: true,
  order: 1,
  match: 'all',
  conditions: [{ type: 'fromAddress', address: TIBOR.email }],
  exceptions: [],
  ai: { runner: 'claude', model: null, effort: null, instructions: null },
  actions: [{ type: 'notify' }],
  ...overrides,
});

export const syncedSetup = async (): Promise<AutomationSetup> => {
  const engine = createTestEngine();
  const codex = new StubAiRunner('codex', () => []);
  engine.runners.register(codex);
  const seeded = await seedAccount(engine);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return { engine, codex, ...seeded };
};

export const listRules = async (engine: TestEngine, userId: UserId): Promise<Automation[]> =>
  supportedAutomations(await engine.services.automations.list(userId));

export const replaceRules = async (
  engine: TestEngine,
  userId: UserId,
  body: ReplaceAutomationsBody,
): Promise<Automation[]> =>
  supportedAutomations(await engine.services.automations.replace(userId, body));

export const restoreRules = async (engine: TestEngine, userId: UserId): Promise<Automation[]> =>
  supportedAutomations(await engine.services.automations.restoreDefault(userId));

export const addAutomations = async (
  engine: TestEngine,
  inputs: readonly AutomationInput[],
): Promise<Automation[]> => {
  const current = await listRules(engine, USER_ID);
  return replaceRules(engine, USER_ID, {
    automations: [...current, ...inputs],
  });
};

export const sync = async ({ engine, account }: AutomationSetup): Promise<void> => {
  const report = await engine.services.sync.syncAccount(USER_ID, account.id);
  expect(report.ok).toBe(true);
};

export const jobsOf = (engine: TestEngine, kind: AiJob['kind']): AiJob[] =>
  [...engine.db.tables.aiJobs.values()].filter((job) => job.kind === kind);

export const threadIdOf = (engine: TestEngine, subject: string): Promise<ThreadId> => {
  const thread = [...engine.db.tables.threads.values()].find((item) => item.subject === subject);
  expect(thread).toBeDefined();
  return Promise.resolve(thread?.id ?? ('missing' as ThreadId));
};

export const notifiedSubjects = (engine: TestEngine): string[] =>
  engine.events.ofType('automation.notified').map((event) => event.data.body);

export const enableJiraTasks = async (engine: TestEngine): Promise<Automation[]> => {
  const current = await listRules(engine, USER_ID);
  return replaceRules(engine, USER_ID, {
    automations: current.map((automation) =>
      automation.preset === 'jiraTasks' ? { ...automation, enabled: true } : automation,
    ),
  });
};
