// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AttachmentMeta } from '@relay/shared';
import {
  ATTACHMENTS,
  clickChip,
  DOCX,
  expectViewerOf,
  installObjectUrls,
  openThread,
  PDF,
  type PlatformRecords,
  recordingOpener,
  serveAttachments,
  syncedPlatform,
} from './support/attachment-viewer';
import { type ContractServer, startContractServer } from './support/contract-server';
import { renderApp, resetStores } from './support/render-app';

describe('attachment chips', () => {
  let server: ContractServer;
  let records: PlatformRecords;

  beforeEach(async () => {
    resetStores();
    installObjectUrls();
    records = { saved: [], opened: [] };
    server = await startContractServer();
    serveAttachments(server);
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  it('shows the type badge, name and size and keeps the download icon a separate button', async () => {
    renderApp({ platform: await syncedPlatform(server, records) });
    const attachments = await openThread();

    const items = within(attachments).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'PDFfaktura-11.pdf48 kB',
      'JPGfoto.jpg2 kB',
      'TXTpoznamky.txt20 B',
      'DOCXzmluva.docx8,8 kB',
    ]);
    expect(within(items[0] ?? attachments).getAllByRole('button')).toHaveLength(2);
    expect(attachments.querySelector('button button')).toBeNull();
  });

  it('downloads from the icon without opening the viewer', async () => {
    renderApp({ platform: await syncedPlatform(server, records) });
    const attachments = await openThread();

    act(() => {
      fireEvent.click(within(attachments).getByRole('button', { name: 'Stiahnuť faktura-11.pdf' }));
    });

    expect(within(attachments).getByText('Sťahujem…')).toBeDefined();
    await waitFor(() => {
      expect(records.saved).toHaveLength(1);
    });
    expect(await records.saved[0]).toEqual({ name: 'faktura-11.pdf', bytes: PDF });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(within(attachments).queryByText('Sťahujem…')).toBeNull();
    });
  });

  it('opens other files in Quick Look straight from the chip when the system offers it', async () => {
    renderApp({ platform: await syncedPlatform(server, records, recordingOpener(records.opened)) });
    const attachments = await openThread();

    clickChip(attachments, 'zmluva.docx');

    await waitFor(() => {
      expect(records.opened).toHaveLength(1);
    });
    expect(await records.opened[0]).toEqual({
      action: 'quickLook',
      name: 'zmluva.docx',
      bytes: DOCX,
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the shown attachment in the default app from the viewer', async () => {
    renderApp({ platform: await syncedPlatform(server, records, recordingOpener(records.opened)) });
    clickChip(await openThread(), 'faktura-11.pdf');
    const dialog = await expectViewerOf('faktura-11.pdf');

    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Otvoriť v aplikácii' }));
    });

    await waitFor(() => {
      expect(records.opened).toHaveLength(1);
    });
    expect(await records.opened[0]).toEqual({ action: 'open', name: 'faktura-11.pdf', bytes: PDF });
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('shows a placeholder with a download for files the web app cannot preview', async () => {
    renderApp({ platform: await syncedPlatform(server, records) });

    clickChip(await openThread(), 'zmluva.docx');

    const dialog = await expectViewerOf('zmluva.docx');
    expect(dialog.textContent).toContain(
      'Pre tento typ súboru nie je náhľad v aplikácii dostupný.',
    );
    expect(within(dialog).queryByRole('button', { name: 'Otvoriť v aplikácii' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Rýchly náhľad' })).toBeNull();
    const downloads = within(dialog).getAllByRole('button', { name: 'Stiahnuť' });
    act(() => {
      fireEvent.click(downloads.at(-1) ?? dialog);
    });
    await waitFor(() => {
      expect(records.saved).toHaveLength(1);
    });
    expect(await records.saved[0]).toEqual({ name: 'zmluva.docx', bytes: DOCX });
  });

  it('offers no direct launch for script files on systems without Quick Look', async () => {
    const script = {
      ...ATTACHMENTS[3],
      id: 'att-cmd',
      filename: 'spusti.command',
    } as AttachmentMeta;
    serveAttachments(server, [...ATTACHMENTS, script]);
    const opener = { ...recordingOpener(records.opened), quickLook: false };
    renderApp({ platform: await syncedPlatform(server, records, opener) });
    const attachments = await openThread();

    clickChip(attachments, 'spusti.command');
    const blocked = await expectViewerOf('spusti.command');
    expect(within(blocked).queryByRole('button', { name: 'Otvoriť v aplikácii' })).toBeNull();
    expect(within(blocked).queryByRole('button', { name: 'Rýchly náhľad' })).toBeNull();

    act(() => {
      fireEvent.click(within(blocked).getByRole('button', { name: /zmluva\.docx/ }));
    });
    const docx = await expectViewerOf('zmluva.docx');
    expect(within(docx).getAllByRole('button', { name: 'Otvoriť v aplikácii' })).toHaveLength(2);
  });
});
