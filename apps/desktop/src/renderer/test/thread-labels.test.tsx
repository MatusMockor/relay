// @vitest-environment jsdom
import type { ThreadSummary } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';

const key = (value: string) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: value });
  });
};

const rows = () =>
  within(screen.getByRole('listbox', { name: 'Konverzácie' })).getAllByRole('option');
const selectedRow = () => rows().find((row) => row.getAttribute('aria-selected') === 'true');
const chipsOf = (row: HTMLElement | undefined) =>
  Array.from(row?.querySelectorAll('.lbl-chips .chip') ?? []).map((chip) =>
    chip.textContent.trim(),
  );
const picker = () => screen.findByRole('dialog', { name: 'Štítky' });
const options = async () =>
  within(within(await picker()).getByRole('listbox', { name: 'Štítky konverzácie' })).getAllByRole(
    'option',
  );
const optionNamed = async (name: string) => {
  const found = (await options()).find((option) => option.textContent.trim() === name);
  expect(found).toBeDefined();
  return found ?? document.body;
};
const type = async (text: string) => {
  const input = within(await picker()).getByRole('textbox', { name: 'Hľadať štítok' });
  act(() => {
    fireEvent.change(input, { target: { value: text } });
  });
};

const firstInboxThread = async (client: MailClient): Promise<ThreadSummary> => {
  const page = await client.listThreads({ view: 'inbox', accountId: demoIds.account('efa') });
  const thread = page.items[0];
  expect(thread).toBeDefined();
  return thread as ThreadSummary;
};

const labelsOfThread = async (client: MailClient, threadId: ThreadSummary['id']) =>
  (await client.getThread(threadId)).thread.labelIds;

const openEfa = async (client: MailClient) => {
  setUi({ scope: demoIds.account('efa') });
  renderApp({ demo: () => client });
  await waitFor(() => {
    expect(rows().length).toBeGreaterThan(0);
  });
};

describe('thread labels', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('shows at most three label chips in a row and folds the rest into +N', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const thread = await firstInboxThread(client);
    const extra = await Promise.all(
      ['Klient', 'Urgentné'].map((name) =>
        client.createLabel({ accountId: thread.accountId, name }),
      ),
    );
    for (const labelId of [
      demoIds.label('efa'),
      demoIds.label('jira'),
      ...extra.map((l) => l.id),
    ]) {
      await client.applyThreadAction(thread.id, { type: 'addLabel', labelId });
    }

    await openEfa(client);

    const row = rows().find((item) => item.getAttribute('data-row') === thread.id);
    await waitFor(() => {
      expect(chipsOf(row)).toHaveLength(4);
    });
    expect(chipsOf(row).at(-1)).toBe('+1');
  });

  it('lists only the account labels and toggles a label on and off with L', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    await openEfa(client);
    const threadId = selectedRow()?.getAttribute('data-row') as ThreadSummary['id'];
    const before = await labelsOfThread(client, threadId);

    key('l');

    expect((await options()).map((option) => option.textContent.trim())).toEqual([
      'eFabrica',
      'Jira',
    ]);
    const jira = await optionNamed('Jira');
    const wasOn = before.includes(demoIds.label('jira'));
    expect(jira.getAttribute('aria-checked')).toBe(String(wasOn));

    act(() => {
      fireEvent.click(jira);
    });

    await waitFor(async () => {
      expect((await labelsOfThread(client, threadId)).includes(demoIds.label('jira'))).toBe(!wasOn);
    });
    expect((await optionNamed('Jira')).getAttribute('aria-checked')).toBe(String(!wasOn));

    act(() => {
      fireEvent.click(jira);
    });

    await waitFor(async () => {
      expect((await labelsOfThread(client, threadId)).includes(demoIds.label('jira'))).toBe(wasOn);
    });
  });

  it('creates a new label from the last row and adds it to the thread', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    await openEfa(client);
    const threadId = selectedRow()?.getAttribute('data-row') as ThreadSummary['id'];
    key('l');
    await type('jira');
    expect((await options()).map((option) => option.textContent.trim())).toEqual(['Jira']);

    await type('Nový klient');
    expect((await options()).at(-1)?.textContent.trim()).toBe('Vytvoriť štítok „Nový klient“');
    key('Enter');

    await waitFor(async () => {
      expect((await optionNamed('Nový klient')).getAttribute('aria-checked')).toBe('true');
    });
    const created = (await client.listLabels(demoIds.account('efa'))).find(
      (label) => label.name === 'Nový klient',
    );
    expect(created?.kind).toBe('keyword');
    expect(await labelsOfThread(client, threadId)).toContain(created?.id);
    await waitFor(() => {
      expect(chipsOf(selectedRow())).toContain('Nový klient');
    });
  });

  it('removes a label with the chip button in the thread header', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const thread = await firstInboxThread(client);
    await client.applyThreadAction(thread.id, {
      type: 'addLabel',
      labelId: demoIds.label('jira'),
    });
    await openEfa(client);
    act(() => {
      setUi({ openThreadId: thread.id });
    });
    const header = await screen.findByRole('group', { name: 'Štítky' });

    act(() => {
      fireEvent.click(within(header).getByRole('button', { name: 'Odstrániť štítok Jira' }));
    });

    await waitFor(() => {
      expect(within(header).queryByRole('button', { name: 'Odstrániť štítok Jira' })).toBeNull();
    });
    expect(await labelsOfThread(client, thread.id)).not.toContain(demoIds.label('jira'));
  });

  it('opens the label picker from the command palette', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    await openEfa(client);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    });
    const palette = await screen.findByRole('dialog', { name: 'Príkazy' });
    act(() => {
      fireEvent.change(within(palette).getByRole('textbox', { name: 'Hľadať príkaz' }), {
        target: { value: 'Štítok' },
      });
    });

    key('Enter');

    expect(await picker()).toBeDefined();
  });
});
