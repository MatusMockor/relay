// @vitest-environment jsdom
import type { OAuthGrant } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPlatform } from '../src/platform/BrowserPlatform';
import type { Platform } from '../src/platform/Platform';
import { setUi } from '../src/state/ui-store';
import { type ContractServer, startContractServer } from './support/contract-server';
import { tokens } from './support/fixtures';
import { renderApp, resetStores, storageWith } from './support/render-app';
import { serverDetail, serverThread } from './support/thread-fixtures';

const NOW = new Date().toISOString();
const GRANT: OAuthGrant = {
  code: 'code-1',
  codeVerifier: 'v'.repeat(43),
  redirectUri: 'http://127.0.0.1:5000/oauth/callback',
};

const at = (hours: number): string => {
  const date = new Date();
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
};

const calendar = (id: string, name: string, overrides: Record<string, unknown> = {}) => ({
  id,
  connectionId: 'ccn-1',
  name,
  color: '#4b5fa8',
  enabled: true,
  primary: false,
  accessRole: 'owner',
  timeZone: 'Europe/Bratislava',
  status: 'ok',
  lastError: null,
  lastSyncedAt: NOW,
  ...overrides,
});

const connection = {
  id: 'ccn-1',
  userId: 'usr-1',
  email: 'me@gmail.test',
  accountId: null,
  status: 'ok',
  lastError: null,
  lastSyncedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  calendars: [
    calendar('gcl-1', 'Ja', { primary: true }),
    calendar('gcl-2', 'Tím', { enabled: false, accessRole: 'reader' }),
  ],
};

const googleOccurrence = (id: string, title: string, access: Record<string, boolean>) => ({
  id,
  eventId: `evt-${id}`,
  sourceKind: 'google',
  accountId: null,
  subscriptionId: null,
  googleCalendarId: 'gcl-1',
  canDelete: false,
  canRespond: false,
  uid: `${id}@google.com`,
  recurrenceId: null,
  title,
  location: null,
  start: at(10),
  end: at(11),
  allDay: false,
  status: 'confirmed',
  myStatus: access.canRespond === true ? 'needs-action' : null,
  organizer: null,
  threadId: null,
  color: '#4b5fa8',
  ...access,
});

describe('Google calendar in synced mode', () => {
  let server: ContractServer;

  beforeEach(async () => {
    resetStores();
    server = await startContractServer();
    const thread = serverThread('Porada');
    server.handle('threads.list', () => ({ body: { items: [thread], nextCursor: null } }));
    server.handle('threads.get', () => ({ body: serverDetail(thread, []) }));
    server.handle('googleCalendar.overview', () => ({
      body: { configured: true, setupHint: null, connections: [connection] },
    }));
  });

  afterEach(async () => {
    resetStores();
    await server.close();
  });

  const start = async (overrides: Partial<Platform> = {}) => {
    const platform = {
      ...createBrowserPlatform(
        storageWith({ mode: 'synced', activeServerUrl: server.url, savedServers: [] }),
      ),
      ...overrides,
    };
    await platform.tokenStore(server.url).save(tokens('access-1'));
    renderApp({ platform });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
  };

  const openSettings = async () => {
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
    });
    return screen.findByRole('region', { name: 'Google kalendár me@gmail.test' });
  };

  it('lists connected calendars and changes visibility and color', async () => {
    server.handle('googleCalendar.updateCalendar', () => ({ body: calendar('gcl-2', 'Tím') }));
    await start();
    const card = await openSettings();

    expect(within(card).getByText('Pripojený')).toBeTruthy();
    expect(within(card).getByText(/hlavný kalendár · vlastník/)).toBeTruthy();
    expect(within(card).getByText(/len na čítanie · skrytý/)).toBeTruthy();
    act(() => {
      fireEvent.click(within(card).getByRole('switch', { name: 'Zobrazovať kalendár Tím' }));
    });
    act(() => {
      fireEvent.click(within(card).getByRole('button', { name: 'Zmeniť farbu kalendára Ja' }));
    });

    await waitFor(() => {
      const patches = server.requests.filter((request) => request.method === 'PATCH');
      expect(patches.map((request) => [request.url, request.body])).toEqual([
        ['/calendar/google/calendars/gcl-2', { enabled: true }],
        ['/calendar/google/calendars/gcl-1', { color: '#3f7d6a' }],
      ]);
    });
  });

  it('connects a calendar with the grant from the consent window', async () => {
    server.handle('googleCalendar.connect', () => ({ body: connection }));
    await start({
      authorizeGoogleCalendar: () => Promise.resolve({ mode: 'synced', grant: GRANT }),
    });
    await openSettings();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pripojiť Google kalendár' }));
    });

    await waitFor(() => {
      const connect = server.requests.find((request) => request.key === 'googleCalendar.connect');
      expect(connect?.body).toEqual({ oauth: GRANT });
    });
    expect(await screen.findByText('Google kalendár me@gmail.test je pripojený')).toBeTruthy();
  });

  it('explains a missing Google client ID and keeps the connect button disabled', async () => {
    server.handle('googleCalendar.overview', () => ({
      body: { configured: false, setupHint: 'Nastav GOOGLE_OAUTH_CLIENT_ID.', connections: [] },
    }));
    await start();
    act(() => {
      setUi({ overlay: { kind: 'settings', section: 'calendars', adding: false } });
    });

    expect(await screen.findByText('Nastav GOOGLE_OAUTH_CLIENT_ID.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Pripojiť Google kalendár' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('answers and deletes Google events from the calendar pane', async () => {
    server.handle('calendar.occurrences', () => ({
      body: {
        items: [
          googleOccurrence('inv', 'Pozvánka', { canRespond: true }),
          googleOccurrence('own', 'Moja', { canDelete: true }),
        ],
      },
    }));
    await start();
    act(() => {
      setUi({ rightTab: 'calendar' });
    });
    const pane = await screen.findByRole('tabpanel', { name: 'Kalendár' });
    const invite = await within(pane).findByRole('group', { name: 'Akcie pre Pozvánka' });
    act(() => {
      fireEvent.click(within(invite).getByRole('button', { name: 'Možno' }));
    });
    const own = within(pane).getByRole('group', { name: 'Akcie pre Moja' });
    act(() => {
      fireEvent.click(within(own).getByRole('button', { name: 'Zmazať' }));
    });
    act(() => {
      fireEvent.click(within(own).getByRole('button', { name: 'Naozaj zmazať?' }));
    });

    await waitFor(() => {
      const rsvp = server.requests.find((request) => request.key === 'googleCalendar.respond');
      expect(rsvp).toMatchObject({ url: '/calendar/google/events/evt-inv/rsvp' });
      expect(rsvp?.body).toEqual({ response: 'tentative' });
      const removed = server.requests.find(
        (request) => request.key === 'googleCalendar.deleteEvent',
      );
      expect(removed?.url).toBe('/calendar/google/events/evt-own');
    });
  });

  it('creates an event from the pane with the keyboard', async () => {
    server.handle('googleCalendar.createEvent', () => ({ body: { eventId: 'evt-new' } }));
    await start();
    act(() => {
      setUi({ rightTab: 'calendar', calendarDay: 0 });
    });
    const pane = await screen.findByRole('tabpanel', { name: 'Kalendár' });
    act(() => {
      fireEvent.click(within(pane).getByRole('button', { name: 'Nová udalosť' }));
    });
    const form = await within(pane).findByRole('form', { name: 'Nová udalosť' });
    const title = within(form).getByLabelText('Názov');
    const submit = within(form).getByRole<HTMLButtonElement>('button', { name: 'Vytvoriť' });
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
    expect(document.activeElement).toBe(title);
    fireEvent.change(title, { target: { value: 'Obed' } });
    fireEvent.change(within(form).getByLabelText('Od'), { target: { value: '12:00' } });
    fireEvent.change(within(form).getByLabelText('Do'), { target: { value: '11:00' } });
    act(() => {
      fireEvent.submit(form);
    });
    expect(within(form).getByRole('alert').textContent).toContain('Koniec musí byť po začiatku');

    fireEvent.change(within(form).getByLabelText('Do'), { target: { value: '13:00' } });
    fireEvent.change(within(form).getByLabelText('Účastníci'), {
      target: { value: 'peter@firma.sk, jana@firma.sk' },
    });
    act(() => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      const created = server.requests.find(
        (request) => request.key === 'googleCalendar.createEvent',
      );
      expect(created?.body).toMatchObject({
        calendarId: 'gcl-1',
        title: 'Obed',
        allDay: false,
        start: at(12),
        end: at(13),
        location: null,
        attendees: ['peter@firma.sk', 'jana@firma.sk'],
      });
    });
    expect(await screen.findByText('Udalosť vytvorená')).toBeTruthy();
    act(() => {
      fireEvent.click(within(pane).getByRole('button', { name: 'Nová udalosť' }));
    });
    const reopened = await within(pane).findByRole('form', { name: 'Nová udalosť' });
    act(() => {
      fireEvent.keyDown(within(reopened).getByLabelText('Názov'), { key: 'Escape' });
    });
    expect(within(pane).queryByRole('form', { name: 'Nová udalosť' })).toBeNull();
  });
});
