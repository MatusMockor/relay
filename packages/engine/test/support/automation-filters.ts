import type { AutomationInput } from '@relay/shared/api';
import type { Label, LabelId, Mailbox, ThreadSummary } from '@relay/shared/domain';
import { expect } from 'vitest';
import { automationInput } from './automations';
import { present, seedAccount, type SeededAccount } from './fixtures';
import { createTestEngine, type TestEngine, USER_ID } from './test-engine';

export interface FolderSetup extends SeededAccount {
  readonly engine: TestEngine;
  readonly folder: Mailbox;
  readonly label: Label;
}

export const folderSetup = async (): Promise<FolderSetup> => {
  const engine = createTestEngine();
  const seeded = await seedAccount(engine);
  seeded.server.addMailbox('Faktúry', 'custom');
  seeded.server.addMailbox('Junk', 'spam');
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const folder = present(
    await engine.repositories.mailboxes.findByPath(seeded.account.id, 'Faktúry'),
  );
  const label = await engine.repositories.labels.upsert({
    id: 'label_clients' as LabelId,
    accountId: seeded.account.id,
    name: 'Clients',
    color: null,
    kind: 'keyword',
    remoteName: 'Clients',
  });
  return { engine, folder, label, ...seeded };
};

export const scopedRule = (
  setup: FolderSetup,
  overrides: Partial<AutomationInput> = {},
): AutomationInput =>
  automationInput({ accountId: setup.account.id, name: 'Faktúry', ...overrides });

export const syncNow = async ({ engine, account }: FolderSetup): Promise<void> => {
  const report = await engine.services.sync.syncAccount(USER_ID, account.id);
  expect(report.ok).toBe(true);
};

export const threadBySubject = (engine: TestEngine, subject: string): ThreadSummary =>
  present([...engine.db.tables.threads.values()].find((thread) => thread.subject === subject));

export const failedActions = (engine: TestEngine): unknown[] =>
  engine.logger.entries
    .filter((entry) => entry.message === 'An automation action failed')
    .map((entry) => entry.context.action);
