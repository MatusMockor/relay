import type { AutomationHistoryResponse } from '@relay/shared/api';
import type { Automation, AutomationActivity, ThreadId } from '@relay/shared/domain';
import { expect } from 'vitest';
import type { FolderSetup } from './automation-filters';
import { present } from './fixtures';
import type { TestEngine } from './test-engine';
import { USER_ID } from './test-engine';

export const historyOf = (
  setup: FolderSetup,
  rule: Automation,
): Promise<AutomationHistoryResponse> =>
  setup.engine.services.automationHistory.history(USER_ID, rule.id);

export const onlyEntry = async (
  setup: FolderSetup,
  rule: Automation,
): Promise<AutomationActivity> => {
  const { entries } = await historyOf(setup, rule);
  expect(entries).toHaveLength(1);
  return present(entries[0]);
};

export const undoEntry = (setup: FolderSetup, rule: Automation, entry: AutomationActivity) =>
  setup.engine.services.automationHistory.undo(USER_ID, rule.id, entry.id);

export const isFlagged = (engine: TestEngine, threadId: ThreadId): boolean =>
  [...engine.db.tables.messages.values()].some(
    (message) => message.threadId === threadId && message.flags.flagged,
  );
