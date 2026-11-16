// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import { setUi } from '../src/state/ui-store';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

const at = (hours: number, minutes = 0): string => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const invitation = (myStatus: string) => ({
  eventId: 'evt-1',
  accountId: 'acc-1',
  messageId: null,
  threadId: 'thread-1',
  method: 'REQUEST',
  uid: 'uid-1@partner.test',
  title: 'Plánovanie Q1',
  location: 'Zasadačka Dunaj',
  description: null,
  organizer: { name: 'Peter Král', email: 'peter@partner.test' },
  attendees: [{ name: null, email: 'me@firma.sk', partstat: myStatus, role: null }],
  start: at(10),
  end: at(11),
  allDay: false,
  recurring: false,
  status: 'confirmed',
  myStatus,
  canRespond: true,
  conflicts: [{ title: 'Standup', start: at(10, 30), end: at(10, 45), allDay: false }],
});

const occurrence = (
  id: string,
  title: string,
  start: string,
  end: string,
  threadId: string | null,
) => ({
  id,
  eventId: id,
  sourceKind: threadId === null ? 'subscription' : 'invite',
  accountId: threadId === null ? null : 'acc-1',
  subscriptionId: threadId === null ? 'sub-1' : null,
  googleCalendarId: null,
  canDelete: false,
  canRespond: false,
  uid: `${id}@test`,
  recurrenceId: null,
  title,
  location: 'Dunaj',
  start,
  end,
  allDay: false,
  status: 'confirmed',
  myStatus: threadId === null ? null : 'needs-action',
  organizer: null,
  threadId,
  color: '#3f7d6a',
});

describe('calendar in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    const thread = serverThread('Pozvánka: Plánovanie Q1');
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const start = async () => {
    const platform = createBrowserPlatform(
      storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
    );
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });
    return screen.findByRole('listbox', { name: 'Konverzácie' });
  };

  it('shows the invitation card with conflicts and sends the answer', async () => {
    server.handle('calendar.invitations', () => ({ body: [invitation('needs-action')] }));
    server.handle('calendar.rsvp', () => ({ body: invitation('accepted') }));
    const list = await start();
    act(() => {
      fireEvent.click(within(list).getAllByRole('option')[0] ?? document.body);
    });

    const card = await screen.findByRole('region', { name: 'Pozvánka Plánovanie Q1' });
    expect(within(card).getByText('Pozvánka · čaká na tvoju odpoveď')).toBeTruthy();
    expect(within(card).getByText('Koliduje s: Standup (10:30-10:45)')).toBeTruthy();
    expect(within(card).getByText(/Organizuje Peter Král · 1 účastník/)).toBeTruthy();
    act(() => {
      fireEvent.click(within(card).getByRole('button', { name: 'Prijať' }));
    });

    await waitFor(() => {
      const rsvp = server.requests.find((request) => request.url.includes('/rsvp'));
      expect(rsvp?.body).toMatchObject({ response: 'accepted' });
      expect(typeof (rsvp?.body as { timeZone?: unknown } | undefined)?.timeZone).toBe('string');
    });
    expect(await screen.findByText('Odpoveď odoslaná: prijaté')).toBeTruthy();
  });

  it('lists the day agenda with source colors and opens the invitation thread', async () => {
    server.handle('calendar.occurrences', () => ({
      body: {
        items: [
          occurrence('a', 'Obed s rodinou', at(12), at(13), null),
          occurrence('b', 'Plánovanie Q1', at(9), at(10), 'thread-1'),
        ],
      },
    }));
    await start();
    act(() => {
      setUi({ rightTab: 'calendar' });
    });

    const pane = await screen.findByRole('tabpanel', { name: 'Kalendár' });
    const invite = await within(pane).findByRole('button', { name: /Plánovanie Q1/ });
    expect(within(pane).getByText('Obed s rodinou')).toBeTruthy();
    expect(within(pane).getByText(/Dunaj · čaká na odpoveď/)).toBeTruthy();
    const rows = pane.querySelectorAll('.agenda .ev b');
    expect([...rows].map((row) => row.textContent)).toEqual(['Plánovanie Q1', 'Obed s rodinou']);
    act(() => {
      fireEvent.click(invite);
    });
    expect(await screen.findByRole('heading', { name: 'Pozvánka: Plánovanie Q1' })).toBeTruthy();
    const occurrencesRequest = server.requests.find((request) =>
      request.url.startsWith('/calendar/occurrences'),
    );
    expect(occurrencesRequest?.url).toMatch(/timeZone=/);
  });

  it('adds an iCal feed from Settings and normalizes webcal links', async () => {
    server.handle('calendar.createSubscription', () => ({
      body: {
        id: 'sub-1',
        userId: 'usr-1',
        name: 'Rodina',
        color: '#3f7d6a',
        host: 'p01-caldav.icloud.com',
        status: 'ok',
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
        eventCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }));
    await start();
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
    });
    const form = await screen.findByRole('form', { name: 'Pridať kalendár' });
    fireEvent.change(within(form).getByLabelText('Názov'), { target: { value: 'Rodina' } });
    fireEvent.change(within(form).getByLabelText('Tajná adresa vo formáte iCal'), {
      target: { value: 'webcal://p01-caldav.icloud.com/published/2/secret' },
    });
    act(() => {
      fireEvent.click(within(form).getByRole('button', { name: 'Pridať kalendár' }));
    });

    await waitFor(() => {
      const create = server.requests.find(
        (request) => request.method === 'POST' && request.url === '/calendar/subscriptions',
      );
      expect(create?.body).toEqual({
        name: 'Rodina',
        url: 'https://p01-caldav.icloud.com/published/2/secret',
        color: '#3f7d6a',
      });
    });
    expect(await screen.findByText('Kalendár Rodina pridaný')).toBeTruthy();
  });

  it('keeps the form filled and explains why a feed could not be added', async () => {
    server.handle('calendar.createSubscription', () => ({
      status: 400,
      body: {
        error: {
          code: 'validation_failed',
          message: 'Kalendár sa nepodarilo pridať. Server kalendára vrátil stav 404.',
        },
      },
    }));
    await start();
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
    });
    const form = await screen.findByRole('form', { name: 'Pridať kalendár' });
    const url = within(form).getByLabelText<HTMLInputElement>('Tajná adresa vo formáte iCal');
    fireEvent.change(url, { target: { value: 'https://calendar.example.test/missing.ics' } });
    act(() => {
      fireEvent.click(within(form).getByRole('button', { name: 'Pridať kalendár' }));
    });

    expect((await within(form).findByRole('alert')).textContent).toBe(
      'Kalendár sa nepodarilo pridať. Server kalendára vrátil stav 404.',
    );
    expect(url.value).toBe('https://calendar.example.test/missing.ics');
  });
});
