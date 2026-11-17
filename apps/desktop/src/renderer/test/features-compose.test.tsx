// @vitest-environment jsdom
import type { AiRunRequest } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { demoClient, gate, heldAi, press, settle } from './features-support';
import { AUTOSAVE_DELAY_MS } from '../src/features/compose/use-compose-draft';
import { renderApp, resetStores } from './support/render-app';

const openCompose = async (client: MailClient) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  press('c', {}, document.body);
  return screen.getByRole('dialog', { name: 'Nová správa' });
};

const field = (dialog: HTMLElement, name: string) => within(dialog).getByRole('textbox', { name });

const saveAndClose = (dialog: HTMLElement) => {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zavrieť a uložiť' }));
};

describe('compose sheet', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('picks the default account when accounts load after the sheet opens', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      listAccounts: async () => {
        await held.wait();
        return base.listAccounts();
      },
    };
    const dialog = await openCompose(client);
    expect(within(dialog).queryByRole('button', { name: /^Od:/ })).toBeNull();
    held.open();
    await settle();
    expect(within(dialog).getByRole('button', { name: /^Od:/ })).toBeDefined();
  });

  it('keeps cc, bcc, extra recipients and attachments of a reopened draft', async () => {
    const client = demoClient();
    const [account] = await client.listAccounts();
    const draft = await client.createDraft({
      accountId: account?.id ?? ('' as never),
      to: [
        { name: 'Tomáš', email: 'tomas@firma.sk' },
        { name: 'Eva', email: 'eva@firma.sk' },
      ],
      cc: [{ name: null, email: 'kopia@firma.sk' }],
      bcc: [{ name: null, email: 'skryta@firma.sk' }],
      subject: 'Ponuka s prílohou',
      body: 'Ahoj, posielam ponuku.',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [
        { id: 'att-1' as never, filename: 'ponuka.pdf', contentType: 'application/pdf', size: 10 },
      ],
    });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('g', {}, document.body);
    press('d', {}, document.body);
    await openDraftRow('Ponuka s prílohou');
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });
    expect(within(dialog).getByText('kopia@firma.sk')).toBeDefined();
    expect(within(dialog).getByText('ponuka.pdf')).toBeDefined();
    fireEvent.change(field(dialog, 'Text správy'), { target: { value: 'Ahoj, upravená ponuka.' } });
    saveAndClose(dialog);
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Nová správa' })).toBeNull();
    const saved = (await client.listDrafts()).find((item) => item.id === draft.id);
    expect(saved?.body).toBe('Ahoj, upravená ponuka.');
    expect(saved?.to.map((address) => address.email)).toEqual(['tomas@firma.sk', 'eva@firma.sk']);
    expect(saved?.cc.map((address) => address.email)).toEqual(['kopia@firma.sk']);
    expect(saved?.bcc.map((address) => address.email)).toEqual(['skryta@firma.sk']);
    expect(saved?.attachments.map((item) => item.filename)).toEqual(['ponuka.pdf']);
  });

  it('keeps the composer open when saving the draft fails', async () => {
    const base = demoClient();
    const client: MailClient = {
      ...base,
      createDraft: () => Promise.reject(new Error('disk je plný')),
    };
    const dialog = await openCompose(client);
    fireEvent.change(field(dialog, 'Predmet'), { target: { value: 'Dôležitá vec' } });
    fireEvent.change(field(dialog, 'Text správy'), { target: { value: 'Neuložený text' } });
    saveAndClose(dialog);
    await settle();
    const still = screen.getByRole('dialog', { name: 'Nová správa' });
    expect((field(still, 'Text správy') as HTMLTextAreaElement).value).toBe('Neuložený text');
    expect(screen.getByRole('status').textContent).toContain('Koncept sa nepodarilo uložiť');
  });

  it('refuses edits while the draft is being saved', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      createDraft: async (content) => {
        await held.wait();
        return base.createDraft(content);
      },
    };
    const dialog = await openCompose(client);
    fireEvent.change(field(dialog, 'Predmet'), { target: { value: 'Pomalé ukladanie' } });
    fireEvent.change(field(dialog, 'Text správy'), { target: { value: 'Prvá verzia' } });
    saveAndClose(dialog);
    fireEvent.change(field(dialog, 'Text správy'), { target: { value: 'Neskorá úprava' } });
    expect(field(dialog, 'Text správy').hasAttribute('readonly')).toBe(true);
    expect(field(dialog, 'Text správy')).toHaveProperty('value', 'Prvá verzia');
    held.open();
    await settle();
    const saved = (await base.listDrafts()).find((draft) => draft.subject === 'Pomalé ukladanie');
    expect(saved?.body).toBe('Prvá verzia');
  });

  it('discards a new message on Esc, including its autosaved draft, and restores it on undo', async () => {
    const client = demoClient();
    const before = (await client.listDrafts()).length;
    const dialog = await openCompose(client);
    fireEvent.change(field(dialog, 'Predmet'), { target: { value: 'Zahodiť ma' } });
    fireEvent.change(field(dialog, 'Text správy'), { target: { value: 'Rozpísaný text' } });
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_DELAY_MS + 100));
    await settle();
    expect((await client.listDrafts()).some((draft) => draft.subject === 'Zahodiť ma')).toBe(true);
    press('Escape', {}, field(dialog, 'Text správy'));
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Nová správa' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Správa zahodená');
    expect(await client.listDrafts()).toHaveLength(before);
    press('z', {}, document.body);
    const restored = await screen.findByRole('dialog', { name: 'Nová správa' });
    expect(field(restored, 'Predmet')).toHaveProperty('value', 'Zahodiť ma');
    expect(field(restored, 'Text správy')).toHaveProperty('value', 'Rozpísaný text');
  });

  it('closes a reopened draft on Esc without deleting it', async () => {
    const client = demoClient();
    const [account] = await client.listAccounts();
    const draft = await client.createDraft({
      accountId: account?.id ?? ('' as never),
      to: [{ name: 'Tomáš', email: 'tomas@firma.sk' }],
      cc: [],
      bcc: [],
      subject: 'Ostávam v Konceptoch',
      body: 'Pôvodný text',
      inReplyToThreadId: null,
      inReplyToMessageId: null,
      attachments: [],
    });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('g', {}, document.body);
    press('d', {}, document.body);
    await openDraftRow('Ostávam v Konceptoch');
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });
    fireEvent.change(field(dialog, 'Text správy'), { target: { value: 'Neuložená úprava' } });
    press('Escape', {}, field(dialog, 'Text správy'));
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Nová správa' })).toBeNull();
    const kept = (await client.listDrafts()).find((item) => item.id === draft.id);
    expect(kept?.body).toBe('Pôvodný text');
  });

  it('ignores a second AI request while the first one runs', async () => {
    const held = gate();
    const requests: AiRunRequest[] = [];
    const dialog = await openCompose(heldAi(demoClient(), held, requests));
    const body = field(dialog, 'Text správy');
    press('j', { ctrlKey: true }, body);
    fireEvent.click(within(dialog).getByRole('button', { name: 'poďakuj' }));
    expect(requests).toHaveLength(1);
    press('j', { ctrlKey: true }, body);
    fireEvent.click(within(dialog).getByRole('button', { name: 'poďakuj' }));
    expect(requests).toHaveLength(1);
    held.open();
    await settle();
  });

  it('does not run AI when Enter confirms an IME composition', async () => {
    const held = gate();
    const requests: AiRunRequest[] = [];
    const dialog = await openCompose(heldAi(demoClient(), held, requests));
    press('j', { ctrlKey: true }, field(dialog, 'Text správy'));
    const instruction = field(dialog, 'Pokyn pre AI');
    fireEvent.change(instruction, { target: { value: 'poďakuj' } });
    press('Enter', { isComposing: true }, instruction);
    expect(requests).toHaveLength(0);
    held.open();
  });

  it('does not pick a recipient when Enter confirms an IME composition', async () => {
    const dialog = await openCompose(demoClient());
    const to = field(dialog, 'Komu');
    act(() => {
      fireEvent.focus(to);
      fireEvent.change(to, { target: { value: 'ondrej@example.sk' } });
    });
    press('Enter', { isComposing: true }, to);
    expect((field(dialog, 'Komu') as HTMLInputElement).value).toBe('ondrej@example.sk');
  });
});

const openDraftRow = async (subject: string) => {
  const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
  await waitFor(() => {
    expect(
      within(list)
        .getAllByRole('option')
        .some((row) => row.textContent.includes(subject)),
    ).toBe(true);
  });
  const row = within(list)
    .getAllByRole('option')
    .find((item) => item.textContent.includes(subject));
  act(() => {
    fireEvent.click(row ?? document.body);
  });
};
