// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ATTACHMENTS,
  clickChip,
  contentRequests,
  expectViewerOf,
  installObjectUrls,
  JPG,
  type ObjectUrls,
  openThread,
  PDF,
  type PlatformRecords,
  previewKeyFeed,
  readBlob,
  serveAttachments,
  syncedPlatform,
} from './support/attachment-viewer';
import { type ContractServer, startContractServer } from './support/contract-server';
import { renderApp, resetStores } from './support/render-app';

const press = (key: string) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });
};

describe('attachment viewer', () => {
  let server: ContractServer;
  let urls: ObjectUrls;
  let records: PlatformRecords;

  beforeEach(async () => {
    resetStores();
    urls = installObjectUrls();
    records = { saved: [], opened: [] };
    server = await startContractServer();
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const start = async (): Promise<HTMLElement> => {
    serveAttachments(server);
    renderApp({ platform: await syncedPlatform(server, records) });
    return openThread();
  };

  it('opens the PDF from its chip with the name, size and position', async () => {
    const attachments = await start();

    clickChip(attachments, 'faktura-11.pdf');

    const dialog = await expectViewerOf('faktura-11.pdf');
    expect(dialog.textContent).toContain('48 kB · 1 / 4');
    const frame = await within(dialog).findByTitle('Dokument faktura-11.pdf');
    const [url = '', fragment] = (frame.getAttribute('src') ?? '').split('#');
    expect(fragment).toBe('toolbar=0');
    expect(urls.live.get(url)?.type).toBe('application/pdf');
    expect(await readBlob(urls.live.get(url) ?? new Blob())).toEqual(PDF);
    expect(within(dialog).queryByRole('button', { name: 'Otvoriť v aplikácii' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Stiahnuť' })).toBeDefined();
    expect(records.saved).toEqual([]);
  });

  it('closes on Escape, revokes the preview and returns focus to the chip', async () => {
    const attachments = await start();
    const chip = clickChip(attachments, 'faktura-11.pdf');
    const dialog = await expectViewerOf('faktura-11.pdf');
    await within(dialog).findByTitle('Dokument faktura-11.pdf');

    press('Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(chip);
    expect(urls.live.size).toBe(0);
    expect(screen.getByRole('list', { name: 'Prílohy' })).toBe(attachments);
  });

  it('switches attachments with the arrow keys and wraps around', async () => {
    const attachments = await start();
    clickChip(attachments, 'faktura-11.pdf');
    await expectViewerOf('faktura-11.pdf');

    press('ArrowRight');
    const image = await screen.findByRole('img', { name: 'foto.jpg' });
    const dialog = await expectViewerOf('foto.jpg');
    expect(dialog.textContent).toContain('2 kB · 2 / 4');
    expect(await readBlob(urls.live.get(image.getAttribute('src') ?? '') ?? new Blob())).toEqual(
      JPG,
    );

    press('ArrowLeft');
    press('ArrowLeft');
    const text = await expectViewerOf('zmluva.docx');
    expect(text.textContent).toContain('4 / 4');

    press('ArrowLeft');
    const notes = await expectViewerOf('poznamky.txt');
    expect((await within(notes).findByLabelText('Obsah súboru poznamky.txt')).textContent).toBe(
      'Poznámky k faktúre',
    );
  });

  it('switches from the footer strip and does not download a seen attachment again', async () => {
    const attachments = await start();
    clickChip(attachments, 'faktura-11.pdf');
    const first = await expectViewerOf('faktura-11.pdf');
    await within(first).findByTitle('Dokument faktura-11.pdf');
    const strip = within(first).getByRole('navigation', { name: 'Prílohy správy' });
    expect(within(strip).getByRole('button', { name: /faktura-11\.pdf/ })).toHaveProperty(
      'ariaCurrent',
      'true',
    );

    act(() => {
      fireEvent.click(within(strip).getByRole('button', { name: /foto\.jpg/ }));
    });
    await screen.findByRole('img', { name: 'foto.jpg' });
    expect(urls.live.size).toBe(1);

    act(() => {
      fireEvent.click(within(strip).getByRole('button', { name: /faktura-11\.pdf/ }));
    });
    await within(first).findByTitle('Dokument faktura-11.pdf');

    expect(contentRequests(server, 'att-pdf')).toBe(1);
    expect(contentRequests(server, 'att-jpg')).toBe(1);
    expect(urls.live.size).toBe(1);
  });

  it('moves with the side buttons and downloads the shown attachment from the header', async () => {
    const attachments = await start();
    clickChip(attachments, 'faktura-11.pdf');
    const dialog = await expectViewerOf('faktura-11.pdf');

    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ďalšia príloha' }));
    });
    await screen.findByRole('img', { name: 'foto.jpg' });
    act(() => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Stiahnuť' }));
    });

    await waitFor(() => {
      expect(records.saved).toHaveLength(1);
    });
    expect(await records.saved[0]).toEqual({ name: 'foto.jpg', bytes: JPG });
    expect(contentRequests(server, 'att-jpg')).toBe(1);
  });

  it('shows a readable error and loads the preview again on retry', async () => {
    let failures = 1;
    serveAttachments(server, ATTACHMENTS, (id) => {
      if (id !== 'att-pdf' || failures === 0) {
        return null;
      }
      failures -= 1;
      return { status: 500, body: { error: { code: 'internal', message: 'Server spadol' } } };
    });
    renderApp({ platform: await syncedPlatform(server, records) });
    clickChip(await openThread(), 'faktura-11.pdf');
    const dialog = await expectViewerOf('faktura-11.pdf');

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain('Náhľad prílohy sa nepodarilo načítať');
    act(() => {
      fireEvent.click(within(alert).getByRole('button', { name: 'Skúsiť znova' }));
    });

    expect(await within(dialog).findByTitle('Dokument faktura-11.pdf')).toBeDefined();
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(contentRequests(server, 'att-pdf')).toBe(2);
  });

  it('follows Escape and the arrows pressed inside the PDF frame', async () => {
    serveAttachments(server);
    const keys = previewKeyFeed();
    const platform = await syncedPlatform(server, records);
    renderApp({ platform: { ...platform, subscribeToPreviewKeys: keys.subscribe } });
    const chip = clickChip(await openThread(), 'faktura-11.pdf');
    await expectViewerOf('faktura-11.pdf');
    expect(keys.listeners.size).toBe(1);

    keys.press('ArrowRight');
    await expectViewerOf('foto.jpg');
    keys.press('ArrowLeft');
    await expectViewerOf('faktura-11.pdf');
    keys.press('Escape');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(chip);
    expect(keys.listeners.size).toBe(0);
  });

  it('lets Tab reach the PDF frame and wraps focus back into the viewer', async () => {
    serveAttachments(server, ATTACHMENTS.slice(0, 1));
    renderApp({ platform: await syncedPlatform(server, records) });
    clickChip(await openThread(), 'faktura-11.pdf');
    const dialog = await expectViewerOf('faktura-11.pdf');
    const frame = await within(dialog).findByTitle('Dokument faktura-11.pdf');
    const first = within(dialog).getByRole('button', { name: 'Stiahnuť' });

    act(() => {
      first.focus();
    });
    act(() => {
      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    });
    expect(document.activeElement).toBe(frame);

    const wrap = dialog.querySelector<HTMLElement>('[data-focus-wrap]');
    act(() => {
      wrap?.focus();
    });
    expect(document.activeElement).toBe(first);
  });
});
