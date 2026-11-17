import type { Task, TaskState, ThreadId, ThreadSummary } from '@relay/shared';
import { act, screen, within } from '@testing-library/react';
import { expect } from 'vitest';
import { createDemoMailClient } from '../../src/data/demo/DemoMailClient';
import type { DemoState } from '../../src/data/demo/demo-state';
import { buildDemoState } from '../../src/data/demo/seed/build-state';
import { demoIds } from '../../src/data/demo/seed/ids';
import type { MailClient } from '../../src/data/MailClient';
import { setUi } from '../../src/state/ui-store';

export const sidePane = () => screen.getByRole('complementary', { name: 'Pravý panel' });

export const seededClient = (): { readonly state: DemoState; readonly client: MailClient } => {
  const state = buildDemoState(new Date());
  return { state, client: createDemoMailClient({ aiStepMs: 0, state }) };
};

export const threadIdOf = (state: DemoState, subject: string): ThreadId => {
  const found = [...state.threads.values()].find((record) => record.summary.subject === subject);
  expect(found).toBeDefined();
  return found?.summary.id ?? demoIds.thread('missing');
};

export const demoTask = (
  key: string,
  threadId: ThreadId | null,
  state: TaskState,
  minutesAgo: number,
): Task => {
  const stamp = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return {
    id: demoIds.task(key),
    userId: demoIds.user,
    threadId,
    jiraKey: null,
    title: `Úloha ${key}`,
    aiWhat: null,
    state,
    source: 'ai',
    createdAt: stamp,
    updatedAt: stamp,
  };
};

export const showContactOf = (threadId: ThreadId): void => {
  act(() => {
    setUi({ openThreadId: threadId, rightOpen: true, rightTab: 'contact' });
  });
};

export const sectionRows = (title: string): string[] => {
  const heading = within(sidePane()).getByRole('heading', { level: 4, name: title });
  const section = heading.parentElement;
  expect(section).not.toBeNull();
  return [...(section?.querySelectorAll('.mini > *') ?? [])].map(
    (row) => row.querySelector('span')?.textContent ?? '',
  );
};

export const cloneThread = (
  state: DemoState,
  subject: string,
  key: string,
  patch: Partial<ThreadSummary>,
): ThreadId => {
  const original = state.threads.get(threadIdOf(state, subject));
  expect(original).toBeDefined();
  const id = demoIds.thread(`clone-${key}`);
  if (original !== undefined) {
    state.threads.set(id, {
      ...original,
      summary: { ...original.summary, id, subject: `Kópia ${key}`, ...patch },
    });
  }
  return id;
};
