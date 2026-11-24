import type { JiraKey, Task, TaskId, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { ConflictError } from '../../src';
import { createTestEngine, TEST_NOW, USER_ID } from '../support/test-engine';

const jiraTask = (id: string, jiraKey: string): Task & { readonly jiraKey: JiraKey } => ({
  id: id as TaskId,
  userId: USER_ID,
  threadId: 'thread_1' as ThreadId,
  jiraKey,
  title: 'Fix login',
  aiWhat: null,
  state: 'open',
  source: 'jira',
  priority: 'none',
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
});

describe('MemoryTaskRepository.createOrGetByJiraKey', () => {
  it('returns the stored task on a same-id replay instead of overwriting later edits', async () => {
    const { repositories } = createTestEngine();
    await repositories.tasks.createOrGetByJiraKey(jiraTask('task_1', 'REL-1'));
    await repositories.tasks.update(USER_ID, 'task_1' as TaskId, {
      state: 'done',
      updatedAt: TEST_NOW,
    });

    const replay = await repositories.tasks.createOrGetByJiraKey(jiraTask('task_1', 'REL-1'));

    expect(replay).toMatchObject({ created: false, task: { id: 'task_1', state: 'done' } });
    expect(await repositories.tasks.findById(USER_ID, 'task_1' as TaskId)).toMatchObject({
      state: 'done',
    });
  });

  it('rejects a same-id creation for another Jira key like the real stores', async () => {
    const { repositories } = createTestEngine();
    await repositories.tasks.createOrGetByJiraKey(jiraTask('task_1', 'REL-1'));

    await expect(
      repositories.tasks.createOrGetByJiraKey(jiraTask('task_1', 'REL-2')),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await repositories.tasks.findByJiraKey(USER_ID, 'REL-1')).not.toBeNull();
  });
});
