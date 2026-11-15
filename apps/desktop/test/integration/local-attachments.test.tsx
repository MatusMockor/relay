// @vitest-environment jsdom
import './support/node-abort-globals';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderApp, resetStores } from '../../src/renderer/test/support/render-app';
import {
  createGreenMailAccount,
  deliverMail,
  type GreenMailAccount,
} from '../main/support/greenmail';
import { imapAccountBody } from '../main/support/seed-account';
import { type DesktopFixture, startDesktop } from './support/desktop-app';

const PDF = Buffer.from('%PDF-1.4\nfaktura\n%%EOF\n', 'utf8');

const readBlob = (blob: Blob): Promise<Buffer> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(Buffer.from(reader.result as ArrayBuffer));
    };
    reader.readAsArrayBuffer(blob);
  });

describe('received attachments in local mode', () => {
  let desktop: DesktopFixture;
  let mailbox: GreenMailAccount;

  beforeEach(async () => {
    resetStores();
    desktop = await startDesktop();
    mailbox = await createGreenMailAccount();
  });

  afterEach(async () => {
    resetStores();
    await desktop.close();
    await mailbox.remove();
  });

  it('downloads the attachment bytes through the main process', async () => {
    await deliverMail(mailbox, {
      from: 'Jana <jana@example.com>',
      subject: 'Faktúra za november',
      text: 'V prílohe faktúra.',
      attachments: [{ filename: 'faktura-11.pdf', contentType: 'application/pdf', content: PDF }],
    });
    const { bridge } = desktop.harness;
    expect((await bridge.invoke('local.accounts.create', imapAccountBody(mailbox))).ok).toBe(true);
    expect((await bridge.invoke('local.sync.now', {})).ok).toBe(true);
    const saved: Promise<{ name: string; bytes: Buffer }>[] = [];
    renderApp({
      platform: {
        ...desktop.platform,
        saveFile: (blob, name) => {
          saved.push(readBlob(blob).then((bytes) => ({ name, bytes })));
        },
      },
    });
    const list = await screen.findByRole('listbox', { name: 'Konverzácie' });
    const row = await within(list).findByRole('option', { name: /Faktúra za november/ });
    act(() => {
      fireEvent.click(row);
    });
    const button = await screen.findByRole('button', { name: 'Stiahnuť faktura-11.pdf' });
    act(() => {
      fireEvent.click(button);
    });
    await waitFor(() => {
      expect(saved).toHaveLength(1);
    });
    expect(await saved[0]).toEqual({ name: 'faktura-11.pdf', bytes: PDF });
  });
});
