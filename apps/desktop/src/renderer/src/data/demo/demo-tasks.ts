import type { AiOutput, Task } from '@relay/shared';
import { demoIds } from './seed/ids';

export const demoTaskFromAi = (output: AiOutput, stamp: string, sequence: number): Task | null => {
  if (output.kind !== 'createTask') {
    return null;
  }
  return {
    id: demoIds.task(`ai-${String(sequence)}`),
    userId: demoIds.user,
    threadId: output.threadId,
    jiraKey: null,
    title: output.title,
    aiWhat: output.aiWhat,
    state: 'open',
    source: 'ai',
    createdAt: stamp,
    updatedAt: stamp,
  };
};
