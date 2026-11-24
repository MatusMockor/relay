// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { MailClientError } from '../src/data/errors';
import { demoClient, press } from './features-support';
import { type Gate, gate } from './support/gate';
import { chord, CSV_SUBJECT, groupOfRow, selectRow } from './support/priority-view';
import { renderApp, resetStores } from './support/render-app';
import { gotoTasks, TASK_TITLE, taskOf, toastText } from './support/tasks-view';

interface Recorded {
  readonly client: MailClient;
  readonly sent: string[];
}

const holdingHigh = (base: MailClient, held: Gate, fails: boolean): Recorded => {
  const sent: string[] = [];
  const client: MailClient = {
    ...base,
    updateTask: async (taskId, patch) => {
      sent.push(patch.priority ?? '');
      if (patch.priority !== 'high') {
        return base.updateTask(taskId, patch);
      }
      await held.wait();
      if (fails) {
        return Promise.reject(
          new MailClientError({ code: 'internal', message: 'Uloženie zlyhalo' }),
        );
      }
      return base.updateTask(taskId, patch);
    },
  };
  return { client, sent };
};

const openOnCsv = async (client: MailClient): Promise<void> => {
  renderApp({ demo: () => client });
  await gotoTasks();
  await waitFor(() => {
    expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
  });
  selectRow(CSV_SUBJECT);
};

describe('queued priority writes', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('sends a newer choice only after the older write finished', async () => {
    const base = demoClient();
    const held = gate();
    const { client, sent } = holdingHigh(base, held, false);
    await openOnCsv(client);

    chord('Digit2', 'ľ');
    await waitFor(() => {
      expect(sent).toEqual(['high']);
    });
    chord('Digit1', '+');

    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Urgentné');
    });
    expect(sent).toEqual(['high']);
    act(() => {
      held.open();
    });
    await waitFor(async () => {
      expect((await taskOf(base, TASK_TITLE)).priority).toBe('urgent');
    });
    expect(sent).toEqual(['high', 'urgent']);
    expect(groupOfRow(CSV_SUBJECT)).toBe('Urgentné');
  });

  it('undoes to the last confirmed priority, not to a choice that failed', async () => {
    const base = demoClient();
    const held = gate();
    const { client, sent } = holdingHigh(base, held, true);
    await openOnCsv(client);

    chord('Digit2', 'ľ');
    await waitFor(() => {
      expect(sent).toEqual(['high']);
    });
    chord('Digit1', '+');
    act(() => {
      held.open();
    });
    await waitFor(() => {
      expect(toastText()).toContain('Priorita: Urgentná');
    });
    press('z', {}, document.body);

    await waitFor(async () => {
      expect((await taskOf(base, TASK_TITLE)).priority).toBe('low');
    });
    await waitFor(() => {
      expect(groupOfRow(CSV_SUBJECT)).toBe('Nízka');
    });
  });
});
