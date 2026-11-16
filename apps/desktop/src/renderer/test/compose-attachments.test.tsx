// @vitest-environment jsdom
import { AttachmentIdSchema } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';
import type { MailClient } from '../src/data/MailClient';
import { AUTOSAVE_DELAY_MS } from '../src/features/compose/use-compose-draft';
import { gate, openThreadBySubject, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const openCompose = async (client: MailClient) => {
  renderApp({ demo: () => client });
  await screen.findByRole('listbox', { name: 'Konverzácie' });
  press('c', {}, document.body);
  return screen.getByRole('dialog', { name: 'Nová správa' });
};

const fileOf = (name: string, size: number, type = 'application/pdf') =>
  new File([new Uint8Array(size)], name, { type });

const attachmentList = (dialog: HTMLElement) =>
  within(dialog).getByRole('list', { name: 'Prílohy' });

const paste = (target: HTMLElement, files: File[]) => {
  act(() => {
    fireEvent.paste(target, { clipboardData: { files, getData: () => '' } });
  });
};

describe('compose attachments', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('uploads pasted and dropped files into an autosaved draft and removes them', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const dialog = await openCompose(client);
    const body = within(dialog).getByRole('textbox', { name: 'Text správy' });

    paste(body, [fileOf('', 2048, 'image/png')]);
    act(() => {
      fireEvent.drop(body, {
        dataTransfer: { types: ['Files'], files: [fileOf('zmluva č. 4.pdf', 4096)] },
      });
    });
    await settle();

    const list = attachmentList(dialog);
    expect(within(list).getByText('vložený obrázok 1.png')).toBeDefined();
    expect(within(list).getByText('zmluva č. 4.pdf')).toBeDefined();
    expect(within(list).getByText('4 kB')).toBeDefined();
    const [draft] = (await client.listDrafts()).filter((item) => item.attachments.length > 0);
    expect(draft?.attachments.map((item) => item.filename)).toEqual([
      'vložený obrázok 1.png',
      'zmluva č. 4.pdf',
    ]);

    act(() => {
      fireEvent.click(
        within(list).getByRole('button', { name: 'Odstrániť prílohu zmluva č. 4.pdf' }),
      );
    });
    await settle();

    const updated = (await client.listDrafts()).find((item) => item.id === draft?.id);
    expect(updated?.attachments.map((item) => item.filename)).toEqual(['vložený obrázok 1.png']);
  });

  it('rejects files over the per file and total limits with a Slovak message', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const dialog = await openCompose(client);
    const body = within(dialog).getByRole('textbox', { name: 'Text správy' });

    paste(body, [fileOf('obrovsky.zip', 25 * 1024 * 1024 + 1)]);
    expect(screen.getByRole('status').textContent).toContain(
      'Súbor obrovsky.zip je väčší ako 25 MB',
    );
    paste(body, [fileOf('a.bin', 15 * 1024 * 1024), fileOf('b.bin', 15 * 1024 * 1024)]);
    await settle();

    expect(screen.getByRole('status').textContent).toContain(
      'Súbor b.bin sa už nezmestí, prílohy spolu môžu mať najviac 25 MB',
    );
    expect(within(attachmentList(dialog)).queryByText('b.bin')).toBeNull();
    expect(within(attachmentList(dialog)).getByText('a.bin')).toBeDefined();
  });

  it('autosaves recipients and text while typing', async () => {
    const client = createDemoMailClient({ aiStepMs: 0 });
    const dialog = await openCompose(client);
    act(() => {
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Komu' }), {
        target: { value: 'eva@firma.sk,' },
      });
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Text správy' }), {
        target: { value: 'Rozpracovaný text' },
      });
    });

    await settle(AUTOSAVE_DELAY_MS + 100);

    const saved = (await client.listDrafts()).find((item) => item.body === 'Rozpracovaný text');
    expect(saved?.to.map((address) => address.email)).toEqual(['eva@firma.sk']);
  });

  it('forwards the original attachments with an empty To field', async () => {
    const state = buildDemoState(new Date());
    const record = [...state.threads.values()].find(
      (item) => item.summary.subject === 'Obed v piatok?',
    );
    const last = record?.messages.at(-1);
    expect(last).toBeDefined();
    if (record !== undefined && last !== undefined) {
      record.messages[record.messages.length - 1] = {
        ...last,
        attachments: [
          {
            id: AttachmentIdSchema.parse('att-menu'),
            filename: 'menu.pdf',
            contentType: 'application/pdf',
            size: 1200,
            contentId: null,
            inline: false,
          },
        ],
      };
    }
    const client = createDemoMailClient({ aiStepMs: 0, state });
    renderApp({ demo: () => client });
    await openThreadBySubject('Obed v piatok?');

    press('f', {}, document.body);

    const dialog = await screen.findByRole('dialog', { name: 'Nová správa' });
    expect(within(dialog).getByRole('textbox', { name: 'Predmet' })).toHaveProperty(
      'value',
      'Fwd: Obed v piatok?',
    );
    expect(within(dialog).queryAllByRole('button', { name: /^Odstrániť príjemcu/ })).toEqual([]);
    expect(
      within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Text správy' }).value,
    ).toContain('---------- Preposlaná správa ----------');
    await waitFor(() => {
      expect(within(attachmentList(dialog)).getByText('menu.pdf')).toBeDefined();
    });
    const draft = (await client.listDrafts()).find(
      (item) => item.subject === 'Fwd: Obed v piatok?',
    );
    expect(draft?.attachments.map((item) => item.filename)).toEqual(['menu.pdf']);
  });

  it('blocks sending until an attachment removed during upload is gone from the draft', async () => {
    const base = createDemoMailClient({ aiStepMs: 0 });
    const held = gate();
    const client: MailClient = {
      ...base,
      addDraftAttachment: async (draftId, file) => {
        await held.wait();
        return base.addDraftAttachment(draftId, file);
      },
    };
    const dialog = await openCompose(client);
    act(() => {
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Komu' }), {
        target: { value: 'eva@firma.sk,' },
      });
    });
    const body = within(dialog).getByRole('textbox', { name: 'Text správy' });
    fireEvent.change(body, { target: { value: 'Posielam' } });
    paste(body, [fileOf('omyl.pdf', 100)]);
    await settle();
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Odstrániť prílohu omyl.pdf' }));
    });

    press('Enter', { ctrlKey: true }, body);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      'Počkaj, kým sa dokončia zmeny príloh',
    );
    held.open();
    await settle();

    const [draft] = (await client.listDrafts()).filter((item) => item.body === 'Posielam');
    expect(draft?.attachments).toEqual([]);
    press('Enter', { ctrlKey: true }, body);
    expect(screen.getByRole('alertdialog')).toBeDefined();
  });

  it('cancelling a forward removes only the copied attachments', async () => {
    const state = buildDemoState(new Date());
    const record = [...state.threads.values()].find(
      (item) => item.summary.subject === 'Obed v piatok?',
    );
    const last = record?.messages.at(-1);
    expect(last).toBeDefined();
    if (record !== undefined && last !== undefined) {
      record.messages[record.messages.length - 1] = {
        ...last,
        attachments: [
          {
            id: AttachmentIdSchema.parse('att-menu'),
            filename: 'menu.pdf',
            contentType: 'application/pdf',
            size: 1200,
            contentId: null,
            inline: false,
          },
        ],
      };
    }
    const base = createDemoMailClient({ aiStepMs: 0, state });
    const held = gate();
    const client: MailClient = {
      ...base,
      forwardAttachments: async (draftId, messageId) => {
        await held.wait();
        return base.forwardAttachments(draftId, messageId);
      },
    };
    renderApp({ demo: () => client });
    await openThreadBySubject('Obed v piatok?');
    press('f', {}, document.body);
    const dialog = await screen.findByRole('dialog', { name: 'Nová správa' });
    paste(within(dialog).getByRole('textbox', { name: 'Text správy' }), [
      fileOf('vlastná.pdf', 10),
    ]);
    await settle();
    act(() => {
      fireEvent.click(
        within(dialog).getByRole('button', {
          name: 'Odstrániť prílohu Prílohy pôvodnej správy (1)',
        }),
      );
    });

    held.open();
    await settle();

    const draft = (await client.listDrafts()).find(
      (item) => item.subject === 'Fwd: Obed v piatok?',
    );
    expect(draft?.attachments.map((item) => item.filename)).toEqual(['vlastná.pdf']);
    expect(within(attachmentList(dialog)).getByText('vlastná.pdf')).toBeDefined();
  });
});
