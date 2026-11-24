import { describe, expect, it } from 'vitest';
import { UpdateTaskBodySchema } from '../src/api/endpoints/tasks';
import {
  AiOutputSchema,
  compareTaskPriority,
  TASK_PRIORITIES,
  TaskPrioritySchema,
  TaskSchema,
  taskPriorityRank,
} from '../src/domain';

const storedTask = {
  id: 'task-1',
  userId: 'user-1',
  threadId: null,
  jiraKey: null,
  title: 'Zavolať Jane',
  aiWhat: null,
  state: 'open',
  source: 'manual',
  createdAt: '2026-11-15T08:00:00.000Z',
  updatedAt: '2026-11-15T08:00:00.000Z',
};

describe('task priority', () => {
  it('ranks urgent first and none last', () => {
    expect(TASK_PRIORITIES.map(taskPriorityRank)).toEqual([0, 1, 2, 3, 4]);
    expect(
      ['none', 'low', 'urgent', 'medium', 'high'].toSorted((left, right) =>
        compareTaskPriority(TaskPrioritySchema.parse(left), TaskPrioritySchema.parse(right)),
      ),
    ).toEqual(['urgent', 'high', 'medium', 'low', 'none']);
  });

  it('reads a task or a createTask answer without a priority as none', () => {
    expect(TaskSchema.parse(storedTask).priority).toBe('none');
    expect(TaskSchema.parse({ ...storedTask, priority: 'high' }).priority).toBe('high');
    expect(
      AiOutputSchema.parse({ kind: 'createTask', threadId: 'thr-1', title: 'A', aiWhat: 'B' }),
    ).toMatchObject({ priority: 'none' });
  });

  it('accepts a known priority in a task update and rejects anything else', () => {
    expect(UpdateTaskBodySchema.parse({ priority: 'low' })).toEqual({ priority: 'low' });
    expect(UpdateTaskBodySchema.safeParse({ priority: 'asap' }).success).toBe(false);
  });
});
