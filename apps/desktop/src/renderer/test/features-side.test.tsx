// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { useChat } from '../src/features/side/chat-store';
import { setUi } from '../src/state/ui-store';
import { demoClient, press } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const reset = () => {
  resetStores();
  useChat.setState({ draft: '' });
};

const pane = () => screen.getByRole('complementary', { name: 'Pravý panel' });

describe('right panel', () => {
  beforeEach(reset);
  afterEach(reset);

  it('labels the AI context with the open thread outside the loaded list', async () => {
    const client = demoClient();
    const done = (await client.listThreads({ view: 'done' })).items[0];
    expect(done).toBeDefined();
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ openThreadId: done?.id ?? null, rightOpen: true, rightTab: 'ai' });
    });
    await waitFor(() => {
      expect(
        within(pane()).getByRole('group', { name: `Kontext: ${done?.subject ?? ''}` }),
      ).toBeDefined();
    });
  });

  it('labels the AI context with the whole mailbox when no thread is open', async () => {
    renderApp({ demo: () => demoClient() });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ openThreadId: null, rightOpen: true, rightTab: 'ai' });
    });
    await waitFor(() => {
      expect(within(pane()).getByRole('group', { name: /^Kontext: / })).toBeDefined();
    });
  });

  it('shows the other participant of a thread the user started', async () => {
    const base = demoClient();
    const [account] = await base.listAccounts();
    const me = { name: account?.senderName ?? null, email: account?.email ?? '' };
    const subject = 'Výlet do Tatier';
    await base.send({
      source: 'inline',
      draft: {
        accountId: account?.id ?? ('' as never),
        to: [{ name: 'Ondrej Bielik', email: 'ondrej@example.sk' }],
        cc: [],
        bcc: [],
        subject,
        body: 'Ideme v sobotu?',
        inReplyToThreadId: null,
        inReplyToMessageId: null,
        attachments: [],
      },
    });
    const client: MailClient = {
      ...base,
      listThreads: async (params) => {
        const page = await base.listThreads(params);
        return {
          ...page,
          items: page.items.map((thread) =>
            thread.subject === subject
              ? { ...thread, participants: [me, ...thread.participants] }
              : thread,
          ),
        };
      },
    };
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('g', {}, document.body);
    press('t', {}, document.body);
    act(() => {
      setUi({ rightOpen: true, rightTab: 'contact' });
    });
    await waitFor(() => {
      expect(
        within(screen.getByRole('listbox', { name: 'Konverzácie' }))
          .getAllByRole('option')
          .some((item) => item.textContent.includes(subject)),
      ).toBe(true);
    });
    const row = within(screen.getByRole('listbox', { name: 'Konverzácie' }))
      .getAllByRole('option')
      .find((item) => item.textContent.includes(subject));
    act(() => {
      fireEvent.click(row ?? document.body);
    });
    await waitFor(() => {
      expect(within(pane()).getByRole('heading', { level: 3 }).textContent).toBe('Ondrej Bielik');
    });
  });

  it('keeps an unsent AI question across tab changes', async () => {
    renderApp({ demo: demoClient });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    act(() => {
      setUi({ rightOpen: true, rightTab: 'ai' });
    });
    fireEvent.change(within(pane()).getByRole('textbox', { name: 'Otázka pre AI' }), {
      target: { value: 'Čo mám dnes vybaviť?' },
    });
    act(() => {
      fireEvent.click(within(pane()).getByRole('tab', { name: /Kontakt/ }));
    });
    act(() => {
      fireEvent.click(within(pane()).getByRole('tab', { name: /AI/ }));
    });
    expect(
      within(pane()).getByRole<HTMLInputElement>('textbox', { name: 'Otázka pre AI' }).value,
    ).toBe('Čo mám dnes vybaviť?');
  });
});
