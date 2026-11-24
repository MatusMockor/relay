// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { demoIds } from '../src/data/demo/seed/ids';
import type { MailClient } from '../src/data/MailClient';
import { sectionKey } from '../src/features/folders/sidebar-sections';
import { setUi, useUiStore } from '../src/state/ui-store';
import { renderApp, resetStores } from './support/render-app';

const sidebar = () => screen.getByRole('navigation', { name: 'Priečinky' });
const group = (name: string) => within(sidebar()).getByRole('region', { name });

const fire = (run: () => void) => {
  act(run);
};

const typeName = (input: HTMLElement, value: string) => {
  fire(() => {
    fireEvent.change(input, { target: { value } });
  });
  fire(() => {
    fireEvent.submit(input);
  });
};

const dropCustomFolders = async (client: MailClient, key: string) => {
  const custom = (await client.listMailboxes(demoIds.account(key)))
    .filter((mailbox) => mailbox.role === 'custom')
    .sort((left, right) => right.path.length - left.path.length);
  for (const mailbox of custom) {
    await client.deleteFolder(mailbox.id);
  }
};

const dropLabels = async (client: MailClient, key: string) => {
  for (const label of await client.listLabels(demoIds.account(key))) {
    await client.deleteLabel(label.id);
  }
};

describe('collapsible sidebar sections', () => {
  let client: MailClient;

  beforeEach(() => {
    resetStores();
    setUi({ leftUser: true });
    client = createDemoMailClient({ aiStepMs: 0 });
  });
  afterEach(() => {
    resetStores();
  });

  it('offers the first folder for an IMAP account with only system mailboxes', async () => {
    await dropCustomFolders(client, 'fl');
    renderApp({ demo: () => client });
    const freelance = await waitFor(() => group('Freelance'));

    expect(
      await within(freelance).findByRole('button', { name: 'Priečinky', expanded: true }),
    ).toBeDefined();
    fire(() => {
      fireEvent.click(
        within(freelance).getByRole('button', { name: 'Nový priečinok v Freelance' }),
      );
    });
    typeName(within(freelance).getByRole('textbox', { name: 'Nový priečinok' }), 'Zmluvy');

    expect(await within(freelance).findByRole('button', { name: 'Zmluvy' })).toBeDefined();
  });

  it('offers the first folder for a new IMAP account before any mailbox is known', async () => {
    const account = await client.createAccount({
      provider: 'imap',
      email: 'meno@novy.sk',
      displayName: 'Nový',
      password: 'tajne',
      settings: {
        imap: { host: 'imap.novy.sk', port: 993, secure: true },
        smtp: { host: 'smtp.novy.sk', port: 465, secure: true },
        username: 'meno@novy.sk',
      },
    });
    expect(await client.listMailboxes(account.id)).toEqual([]);
    renderApp({ demo: () => client });
    const fresh = await waitFor(() => group('Nový'));

    expect(
      await within(fresh).findByRole('button', { name: 'Priečinky', expanded: true }),
    ).toBeDefined();
    expect(within(fresh).getByRole('button', { name: 'Štítky', expanded: true })).toBeDefined();
    fire(() => {
      fireEvent.click(within(fresh).getByRole('button', { name: 'Nový priečinok v Nový' }));
    });
    typeName(within(fresh).getByRole('textbox', { name: 'Nový priečinok' }), 'Zmluvy');

    expect(await within(fresh).findByRole('button', { name: 'Zmluvy' })).toBeDefined();
  });

  it('collapses the folders section, remembers it and reopens it for a new folder', async () => {
    const key = sectionKey('mbx', demoIds.account('efa'));
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));
    await within(efabrica).findByRole('button', { name: /Faktúry/ });

    fire(() => {
      fireEvent.click(within(efabrica).getByRole('button', { name: 'Priečinky', expanded: true }));
    });

    expect(within(efabrica).queryByRole('button', { name: /Faktúry/ })).toBeNull();
    expect(within(efabrica).getByRole('button', { name: 'Jira' })).toBeDefined();
    expect(useUiStore.getState().collapsed[key]).toBe(true);
    expect(window.localStorage.getItem('relay.layout')).toContain(key);

    fire(() => {
      fireEvent.click(within(efabrica).getByRole('button', { name: 'Nový priečinok v eFabrica' }));
    });

    expect(useUiStore.getState().collapsed[key]).toBeUndefined();
    expect(
      within(efabrica).getByRole('button', { name: 'Priečinky', expanded: true }),
    ).toBeDefined();
    expect(within(efabrica).getByRole('textbox', { name: 'Nový priečinok' })).toBeDefined();
    expect(within(efabrica).getByRole('button', { name: /Faktúry/ })).toBeDefined();
  });

  it('collapses the labels section and creates a label from its heading', async () => {
    renderApp({ demo: () => client });
    const efabrica = await waitFor(() => group('eFabrica'));
    await within(efabrica).findByRole('button', { name: 'Jira' });

    fire(() => {
      fireEvent.click(within(efabrica).getByRole('button', { name: 'Štítky', expanded: true }));
    });

    expect(within(efabrica).queryByRole('button', { name: 'Jira' })).toBeNull();
    expect(within(efabrica).getByRole('button', { name: /Faktúry/ })).toBeDefined();

    fire(() => {
      fireEvent.click(within(efabrica).getByRole('button', { name: 'Nový štítok v eFabrica' }));
    });
    typeName(within(efabrica).getByRole('textbox', { name: 'Nový štítok' }), 'Zmluvy');

    expect(await within(efabrica).findByRole('button', { name: 'Zmluvy' })).toBeDefined();
    expect(within(efabrica).getByRole('button', { name: 'Jira' })).toBeDefined();
    const names = (await client.listLabels(demoIds.account('efa'))).map((label) => label.name);
    expect(names).toContain('Zmluvy');
  });

  it('offers the first label for a Gmail account without labels', async () => {
    await dropLabels(client, 'os');
    renderApp({ demo: () => client });
    const personal = await waitFor(() => group('Osobný'));

    expect(
      await within(personal).findByRole('button', { name: 'Štítky', expanded: true }),
    ).toBeDefined();
    expect(within(personal).queryByRole('button', { name: 'Priečinky' })).toBeNull();
    fire(() => {
      fireEvent.click(within(personal).getByRole('button', { name: 'Nový štítok v Osobný' }));
    });
    typeName(within(personal).getByRole('textbox', { name: 'Nový štítok' }), 'Faktúry');

    expect(await within(personal).findByRole('button', { name: 'Faktúry' })).toBeDefined();
  });
});
