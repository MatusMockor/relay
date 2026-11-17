// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import { replyAllRecipients } from '../src/features/mail/reply-all-draft';
import { openThreadBySubject, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openCompose = async () => {
  renderApp();
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  press('c', {}, document.body);
  return screen.getByRole('dialog', { name: 'Nová správa' });
};

const chipsOf = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByRole('button', { name: /^Odstrániť príjemcu/ })
    .map((button) => button.getAttribute('aria-label')?.replace('Odstrániť príjemcu ', ''));

describe('compose recipients', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('turns typed and pasted addresses into chips and flags invalid ones', async () => {
    const dialog = await openCompose();
    const to = within(dialog).getByRole('textbox', { name: 'Komu' });

    act(() => {
      fireEvent.change(to, { target: { value: 'eva@firma.sk, ' } });
    });
    act(() => {
      fireEvent.paste(to, {
        clipboardData: { getData: () => 'Ján Novák <jan@firma.sk>; zla-adresa' },
      });
    });

    expect(chipsOf(dialog)).toEqual(['eva@firma.sk', 'Ján Novák', 'zla-adresa']);
    expect(within(dialog).getByText(', neplatná adresa')).toBeDefined();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Text správy' }), {
      target: { value: 'Ahoj' },
    });
    press('Enter', { ctrlKey: true }, within(dialog).getByRole('textbox', { name: 'Text správy' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Oprav neplatnú adresu zla-adresa');
    press('Backspace', {}, to);
    expect(chipsOf(dialog)).toEqual(['eva@firma.sk', 'Ján Novák']);
  });

  it('suggests known contacts after the session replaced its services', async () => {
    const { session } = renderApp();
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    await act(async () => {
      await session.boot();
    });
    await settle();
    press('c', {}, document.body);
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });

    expect(within(dialog).getByRole('listbox', { name: 'Návrhy kontaktov' })).toBeDefined();
  });

  it('does not suggest an address already used in another recipient field', async () => {
    const dialog = await openCompose();
    const suggestions = within(dialog).getByRole('listbox', { name: 'Návrhy kontaktov' });
    const first = within(suggestions).getAllByRole('option')[0];
    expect(first).toBeDefined();
    const email = first?.querySelector('small')?.textContent ?? '';
    act(() => {
      if (first !== undefined) {
        fireEvent.mouseDown(first);
      }
    });

    press('b', { ctrlKey: true, shiftKey: true }, dialog);
    await settle();
    const bccSuggestions = within(dialog).getByRole('listbox', { name: 'Návrhy kontaktov' });

    expect(email).toContain('@');
    expect(bccSuggestions.textContent).not.toContain(email);
  });

  it('reveals Cc and Bcc with shortcuts and keeps them in the saved draft', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('c', {}, document.body);
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });
    expect(within(dialog).queryByRole('textbox', { name: 'Kópia' })).toBeNull();

    press('c', { ctrlKey: true, shiftKey: true }, dialog);
    await settle();
    const cc = within(dialog).getByRole('textbox', { name: 'Kópia' });
    expect(document.activeElement).toBe(cc);
    act(() => {
      fireEvent.change(cc, { target: { value: 'sef@firma.sk,' } });
    });
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Skrytá' }));
    });
    act(() => {
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Skrytá kópia' }), {
        target: { value: 'archiv@firma.sk;' },
      });
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Predmet' }), {
        target: { value: 'Porada' },
      });
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zavrieť a uložiť' }));
    await settle();

    const saved = (await client.listDrafts()).find((draft) => draft.subject === 'Porada');
    expect(saved?.cc.map((address) => address.email)).toEqual(['sef@firma.sk']);
    expect(saved?.bcc.map((address) => address.email)).toEqual(['archiv@firma.sk']);
  });

  it('fills reply all recipients without the own addresses', async () => {
    const state = buildDemoState(new Date());
    const record = [...state.threads.values()].find(
      (item) => item.summary.subject === 'Obed v piatok?',
    );
    const last = record?.messages.at(-1);
    expect(last).toBeDefined();
    if (record !== undefined && last !== undefined) {
      record.messages[record.messages.length - 1] = {
        ...last,
        from: { name: 'Tomáš', email: 'tomas@firma.sk' },
        to: [
          { name: 'Ty', email: 'meno@efabrica.sk' },
          { name: 'Eva', email: 'eva@firma.sk' },
        ],
        cc: [
          { name: null, email: 'MENO@efabrica.sk' },
          { name: 'Peter', email: 'peter@firma.sk' },
        ],
      };
    }
    renderApp({ demo: () => createDemoMailClient({ aiStepMs: 0, state }) });
    await openThreadBySubject('Obed v piatok?');

    press('R', { shiftKey: true }, document.body);

    const dialog = await screen.findByRole('dialog', { name: 'Nová správa' });
    expect(chipsOf(dialog)).toEqual(['Tomáš', 'Eva', 'Peter']);
    expect(within(dialog).getByRole('textbox', { name: 'Kópia' })).toBeDefined();
    expect(within(dialog).getByRole('textbox', { name: 'Predmet' })).toHaveProperty(
      'value',
      'Re: Obed v piatok?',
    );
  });
});

describe('replyAllRecipients', () => {
  it('replies to the reply-to address and drops duplicates', async () => {
    const state = buildDemoState(new Date());
    const record = [...state.threads.values()][0];
    const last = record?.messages.at(-1);
    expect(last).toBeDefined();
    if (record !== undefined && last !== undefined) {
      record.messages = [
        {
          ...last,
          from: { name: 'Bot', email: 'bot@firma.sk' },
          replyTo: [{ name: 'Tím', email: 'tim@firma.sk' }],
          to: [
            { name: null, email: 'tim@firma.sk' },
            { name: null, email: 'ja@relay.sk' },
          ],
          cc: [{ name: null, email: 'Tim@firma.sk' }],
        },
      ];
    }
    const client = createDemoMailClient({ aiStepMs: 0, state });
    const detail = await client.getThread(record?.summary.id ?? ('missing' as never));

    expect(replyAllRecipients(detail, ['ja@relay.sk'])).toEqual({
      to: [{ name: 'Tím', email: 'tim@firma.sk' }],
      cc: [],
    });
  });

  it('uses the recipients of the latest message when it was sent by the user', async () => {
    const state = buildDemoState(new Date());
    const record = [...state.threads.values()][0];
    const last = record?.messages.at(-1);
    expect(last).toBeDefined();
    if (record !== undefined && last !== undefined) {
      record.messages = [
        {
          ...last,
          from: { name: 'Jana', email: 'jana@firma.sk' },
          to: [{ name: null, email: 'ja@relay.sk' }],
        },
        {
          ...last,
          from: { name: 'Ja', email: 'ja@relay.sk' },
          to: [{ name: 'Jana', email: 'jana@firma.sk' }],
          cc: [{ name: 'Šéf', email: 'sef@firma.sk' }],
        },
      ];
    }
    const client = createDemoMailClient({ aiStepMs: 0, state });
    const detail = await client.getThread(record?.summary.id ?? ('missing' as never));

    expect(replyAllRecipients(detail, ['ja@relay.sk'])).toEqual({
      to: [{ name: 'Jana', email: 'jana@firma.sk' }],
      cc: [{ name: 'Šéf', email: 'sef@firma.sk' }],
    });
  });
});
