// @vitest-environment jsdom
import type { AiRunRequest, ThreadId } from '@relay/shared';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { setUi, useUiStore } from '../src/state/ui-store';
import { demoClient, gate, heldAi, openThreadBySubject, press, settle } from './features-support';
import { renderApp, resetStores } from './support/render-app';

describe('reply composer', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it('restores the reply when saving its draft fails', async () => {
    const base = demoClient();
    const client: MailClient = {
      ...base,
      updateDraft: () => Promise.reject(new Error('server neodpovedá')),
      createDraft: () => Promise.reject(new Error('server neodpovedá')),
    };
    renderApp({ demo: () => client });
    await openThreadBySubject('Obed v piatok?');
    press('r', {}, document.body);
    const area = await screen.findByRole('textbox', { name: 'Odpoveď' });
    fireEvent.change(area, { target: { value: 'Ahoj, nový text odpovede.' } });
    press('Escape', {}, area);
    await settle();
    const restored = screen.getByRole('textbox', { name: 'Odpoveď' });
    expect((restored as HTMLTextAreaElement).value).toBe('Ahoj, nový text odpovede.');
  });

  it('does not write an older rewrite into a newer reply on the same thread', async () => {
    const base = demoClient();
    const gates = [gate(), gate()];
    let calls = 0;
    const client: MailClient = {
      ...base,
      runAi: (request, listener) => {
        const held = gates[calls] ?? gate();
        calls += 1;
        let stop: () => void = () => undefined;
        let stopped = false;
        void held.wait().then(() => {
          if (!stopped) {
            stop = base.runAi(request, listener);
          }
        });
        return () => {
          stopped = true;
          stop();
        };
      },
    };
    renderApp({ demo: () => client });
    await openThreadBySubject('Obed v piatok?');
    press('r', {}, document.body);
    press('j', { ctrlKey: true }, await screen.findByRole('textbox', { name: 'Odpoveď' }));
    fireEvent.click(screen.getByRole('button', { name: 'kratšie' }));
    const threadId = useUiStore.getState().reply?.threadId ?? ('' as ThreadId);
    act(() => {
      setUi({ reply: null });
    });
    act(() => {
      setUi({
        reply: {
          threadId,
          accountId: '' as never,
          text: 'Druhá odpoveď',
          draftId: null,
          aiOpen: false,
          busy: false,
        },
      });
    });
    press('j', { ctrlKey: true }, screen.getByRole('textbox', { name: 'Odpoveď' }));
    fireEvent.click(screen.getByRole('button', { name: 'formálnejšie' }));
    expect(calls).toBe(2);
    gates[0]?.open();
    await settle(50);
    expect(useUiStore.getState().reply?.busy).toBe(true);
    gates[1]?.open();
    await settle(50);
    expect(useUiStore.getState().reply?.busy).toBe(false);
  });

  it('restores a reply whose save failed without a stale busy flag', async () => {
    const base = demoClient();
    const aiGate = gate();
    const saveGate = gate();
    const client: MailClient = {
      ...heldAi(base, aiGate, []),
      updateDraft: async () => {
        await saveGate.wait();
        return Promise.reject(new Error('server neodpovedá'));
      },
    };
    renderApp({ demo: () => client });
    await openThreadBySubject('Obed v piatok?');
    press('r', {}, document.body);
    const area = await screen.findByRole('textbox', { name: 'Odpoveď' });
    press('j', { ctrlKey: true }, area);
    fireEvent.click(screen.getByRole('button', { name: 'kratšie' }));
    press('Escape', {}, screen.getByRole('textbox', { name: 'Odpoveď' }));
    expect(useUiStore.getState().reply).toBeNull();
    aiGate.open();
    await settle(50);
    saveGate.open();
    await settle(50);
    expect(useUiStore.getState().reply?.busy).toBe(false);
    expect(screen.getByRole('textbox', { name: 'Odpoveď' }).hasAttribute('readonly')).toBe(false);
  });

  it('does not write a finished rewrite into a reply for another thread', async () => {
    const base = demoClient();
    const held = gate();
    const requests: AiRunRequest[] = [];
    const client = heldAi(base, held, requests);
    const page = await base.listThreads({ view: 'inbox' });
    const other = page.items.find((item) => item.subject !== 'Obed v piatok?');
    renderApp({ demo: () => client });
    await openThreadBySubject('Obed v piatok?');
    press('r', {}, document.body);
    const area = await screen.findByRole('textbox', { name: 'Odpoveď' });
    press('j', { ctrlKey: true }, area);
    fireEvent.click(screen.getByRole('button', { name: 'kratšie' }));
    expect(requests).toHaveLength(1);
    act(() => {
      setUi({
        reply: {
          threadId: other?.id ?? ('' as ThreadId),
          accountId: other?.accountId ?? ('' as never),
          text: 'Moja rozpísaná odpoveď',
          draftId: null,
          aiOpen: false,
          busy: false,
        },
      });
    });
    held.open();
    await settle(50);
    expect(useUiStore.getState().reply?.text).toBe('Moja rozpísaná odpoveď');
    expect(useUiStore.getState().reply?.busy).toBe(false);
  });
});
