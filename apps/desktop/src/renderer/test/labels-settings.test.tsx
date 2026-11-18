// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { setUi } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';

const openLabels = async (client: MailClient) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  act(() => {
    setUi({ overlay: { kind: 'settings', section: 'labels', adding: false } });
  });
  return screen.findByRole('tabpanel', { name: 'Štítky' });
};

const efaLabel = async (client: MailClient, name: string) =>
  (await client.listLabels(demoIds.account('efa'))).find((label) => label.name === name);

describe('labels settings', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('groups labels per account', async () => {
    const panel = await openLabels(createDemoMailClient({ aiStepMs: 0 }));

    const groups = await within(panel).findAllByRole('region', { name: /^Štítky účtu /u });
    expect(groups).toHaveLength(3);
    expect(within(panel).getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(3);
    expect(within(panel).getByRole('textbox', { name: 'Názov štítka Jira' })).toBeDefined();
  });

  it('renames a label inline and rejects a duplicate name', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const panel = await openLabels(client);
    const input = await within(panel).findByRole('textbox', { name: 'Názov štítka Jira' });

    act(() => {
      fireEvent.change(input, { target: { value: 'Jira Cloud' } });
      fireEvent.blur(input);
    });

    await waitFor(async () => {
      expect(await efaLabel(client, 'Jira Cloud')).toBeDefined();
    });
    const renamed = await within(panel).findByRole('textbox', { name: 'Názov štítka Jira Cloud' });
    act(() => {
      fireEvent.change(renamed, { target: { value: 'efabrica' } });
      fireEvent.keyDown(renamed, { key: 'Enter' });
    });

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Štítok s týmto názvom už existuje.',
      );
    });
    await waitFor(() => {
      expect((renamed as HTMLInputElement).value).toBe('Jira Cloud');
    });
  });

  it('changes the label colour from the swatch palette', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const panel = await openLabels(client);

    act(() => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Zmeniť farbu štítka Jira' }));
    });
    const swatches = await screen.findByRole('radiogroup', { name: 'Farba štítka Jira' });
    act(() => {
      fireEvent.click(within(swatches).getByRole('radio', { name: 'Farba #ef6b6b' }));
    });

    await waitFor(async () => {
      expect((await efaLabel(client, 'Jira'))?.color).toBe('#ef6b6b');
    });
    expect(screen.queryByRole('radiogroup', { name: 'Farba štítka Jira' })).toBeNull();
  });

  it('deletes a label after confirming and strips it from every thread', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const jira = demoIds.label('jira');
    const labelled = await client.listThreads({ view: 'label', labelId: jira });
    expect(labelled.items.length).toBeGreaterThan(0);
    const panel = await openLabels(client);

    act(() => {
      fireEvent.click(within(panel).getByRole('button', { name: 'Zmazať štítok Jira' }));
    });
    const dialog = await screen.findByRole('alertdialog', { name: 'Zmazať štítok „Jira“?' });
    expect(dialog.textContent).toContain('Odstráni sa zo všetkých správ.');
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: /Zmazať/u }));
    });

    await waitFor(() => {
      expect(within(panel).queryByRole('textbox', { name: 'Názov štítka Jira' })).toBeNull();
    });
    expect(await efaLabel(client, 'Jira')).toBeUndefined();
    for (const thread of labelled.items) {
      expect((await client.getThread(thread.id)).thread.labelIds).not.toContain(jira);
    }
    expect(screen.getByRole('status').textContent).toContain('Štítok „Jira“ je zmazaný');
  });
});
