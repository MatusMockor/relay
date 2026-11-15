// @vitest-environment jsdom
import type { ThreadDetail } from '@relay/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MailClient, MailEventListener } from '../src/data/MailClient';
import { TextBody } from '../src/features/thread/TextBody';
import { demoClient, gate, openThreadBySubject, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

const DAY = 86_400_000;

const rowSubjects = (): string[] => {
  const list = screen.queryByRole('listbox', { name: 'Konverzácie' });
  return list === null
    ? []
    : within(list)
        .queryAllByRole('option')
        .map((row) => row.textContent);
};

describe('thread lists', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
    vi.restoreAllMocks();
  });

  it('keys reminder groups uniquely when equal labels are not adjacent', async () => {
    const base = demoClient();
    const inbox = await base.listThreads({ view: 'inbox' });
    const [first, second, third] = inbox.items;
    const tomorrow = new Date(Date.now() + DAY).toISOString();
    const later = new Date(Date.now() + 9 * DAY).toISOString();
    await base.applyThreadAction(first?.id ?? ('' as never), { type: 'remind', at: tomorrow });
    await base.applyThreadAction(second?.id ?? ('' as never), { type: 'remind', at: later });
    await base.applyThreadAction(third?.id ?? ('' as never), { type: 'remind', at: tomorrow });
    const client: MailClient = {
      ...base,
      listThreads: async (params) => {
        const page = await base.listThreads(params);
        return {
          ...page,
          items: [...page.items].sort(
            (a, b) => Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt),
          ),
        };
      },
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('g', {}, document.body);
    press('h', {}, document.body);
    await waitFor(() => {
      const labels = screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'));
      expect(labels.length).toBeGreaterThan(new Set(labels).size);
    });
    const keyWarnings = errors.mock.calls.filter((call) =>
      call.some((part) => String(part).includes('same key')),
    );
    expect(keyWarnings).toEqual([]);
  });

  it('waits for scheduled sends before showing Drafts', async () => {
    const base = demoClient();
    const held = gate();
    const client: MailClient = {
      ...base,
      listScheduled: async () => {
        await held.wait();
        return base.listScheduled();
      },
    };
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('g', {}, document.body);
    press('d', {}, document.body);
    await settle();
    expect(rowSubjects().some((text) => text.includes('Stav Partner API'))).toBe(false);
    held.open();
    await waitFor(() => {
      expect(rowSubjects().some((text) => text.includes('Obed v piatok?'))).toBe(true);
    });
    expect(rowSubjects().some((text) => text.includes('Stav Partner API'))).toBe(false);
  });

  it('keeps a scheduled send when cancelling it fails', async () => {
    const base = demoClient();
    const client: MailClient = {
      ...base,
      cancelScheduled: () => Promise.reject(new Error('server neodpovedá')),
    };
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    press('g', {}, document.body);
    press('n', {}, document.body);
    await waitFor(() => {
      expect(rowSubjects().some((text) => text.includes('Stav Partner API'))).toBe(true);
    });
    const row = within(screen.getByRole('listbox', { name: 'Konverzácie' }))
      .getAllByRole('option')
      .find((item) => item.textContent.includes('Stav Partner API'));
    act(() => {
      fireEvent.click(row ?? document.body);
    });
    await settle();
    expect(screen.queryByRole('dialog', { name: 'Nová správa' })).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Odoslanie sa nepodarilo pozastaviť');
    expect((await base.listScheduled()).map((item) => item.status)).toEqual(['pending']);
  });

  it('keeps a checklist tick when an older thread fetch resolves afterwards', async () => {
    const base = demoClient();
    let hold: ReturnType<typeof gate> | null = null;
    let heldFetches = 0;
    const listeners: MailEventListener[] = [];
    const client: MailClient = {
      ...base,
      getThread: async (id) => {
        const snapshot: ThreadDetail = await base.getThread(id);
        const current = hold;
        if (current !== null) {
          heldFetches += 1;
          await current.wait();
        }
        return snapshot;
      },
      subscribe: (listener) => {
        listeners.push(listener);
        return () => undefined;
      },
    };
    renderApp({ demo: () => client });
    await openThreadBySubject('Code review: refaktor platobnej brány');
    const threadId = (await base.listThreads({ view: 'inbox', q: 'Code review' })).items[0]?.id;
    const message = (await base.getThread(threadId ?? ('' as never))).messages[0];
    expect(message).toBeDefined();
    expect(
      screen.getByRole('button', { name: /Pozrieť MR !412/ }).getAttribute('aria-pressed'),
    ).toBe('false');
    const stale = gate();
    hold = stale;
    act(() => {
      listeners.forEach((listener) => {
        listener({
          type: 'message.upserted',
          at: new Date().toISOString(),
          data: { message: message ?? ({} as never) },
        });
      });
    });
    await waitFor(() => {
      expect(heldFetches).toBe(1);
    });
    hold = null;
    fireEvent.click(screen.getByRole('button', { name: /Pozrieť MR !412/ }));
    await settle();
    stale.open();
    await settle(50);
    expect(
      screen.getByRole('button', { name: /Pozrieť MR !412/ }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
});

describe('plain-text bodies', () => {
  afterEach(() => {
    resetStores();
  });

  it('shows a message that consists only of quoted lines', () => {
    render(<TextBody text="> Approved budget: EUR 500" />);
    expect(screen.getByText('Approved budget: EUR 500')).toBeDefined();
  });

  it('hides quoted lines behind a toggle when the message has its own text', () => {
    render(<TextBody text={'Súhlasím.\n\n> Approved budget: EUR 500'} />);
    expect(screen.queryByText('Approved budget: EUR 500')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zobraziť citovaný text' }));
    expect(screen.getByText('Approved budget: EUR 500')).toBeDefined();
  });
});
