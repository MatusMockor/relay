// @vitest-environment jsdom
import type { AiRunRequest } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MailClient } from '../src/data/MailClient';
import { press } from './features-support';
import {
  cloneThread,
  sectionRows,
  seededClient,
  showContactOf,
  sidePane,
  threadIdOf,
} from './support/contact-pane';
import { renderApp, resetStores } from './support/render-app';

const recordingAi = (base: MailClient, requests: AiRunRequest[]): MailClient => ({
  ...base,
  runAi: (request, listener) => {
    requests.push(request);
    return base.runAi(request, listener);
  },
});

const contactHeading = () => within(sidePane()).queryByRole('heading', { level: 3 });

describe('contact pane while composing', () => {
  beforeEach(resetStores);
  afterEach(resetStores);

  it('follows the first To recipient and reverts when the composer closes', async () => {
    const { state, client: base } = seededClient();
    const requests: AiRunRequest[] = [];
    renderApp({ demo: () => recordingAi(base, requests) });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    showContactOf(threadIdOf(state, 'Obed v piatok?'));
    await waitFor(() => {
      expect(contactHeading()?.textContent).toBe('Tomáš Baláž');
    });

    press('c', {}, document.body);
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });
    expect(contactHeading()?.textContent).toBe('Tomáš Baláž');
    expect(sidePane().closest('.app')?.classList.contains('composing')).toBe(true);
    expect(dialog.contains(sidePane())).toBe(false);
    act(() => {
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Komu' }), {
        target: { value: 'Lucia Hrubá <lucia.hruba@firma.sk>, ' },
      });
    });

    await waitFor(() => {
      expect(within(sidePane()).getByText('· adresát')).toBeDefined();
    });
    expect(within(sidePane()).getByText('Lucia Hrubá')).toBeDefined();
    expect(contactHeading()).toBeNull();
    await waitFor(() => {
      expect(sectionRows('Posledné konverzácie')).toEqual([
        'Prístupy na stage pre nového kolegu',
        'Re: Onboarding checklist',
      ]);
    });
    expect(within(sidePane()).queryByRole('region', { name: 'Kontext' })).toBeNull();
    expect(requests).toEqual([]);

    act(() => {
      fireEvent.click(within(sidePane()).getByRole('button', { name: /Pripomenúť kontext/ }));
    });
    const card = await within(sidePane()).findByRole('region', { name: 'Kontext' });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toMatchObject({ kind: 'chatAnswer', threadId: null });
    expect(requests[0]?.input.kind === 'chatAnswer' ? requests[0].input.question : '').toContain(
      'lucia.hruba@firma.sk',
    );
    await waitFor(() => {
      expect(card.querySelector('.ans')?.textContent ?? '').not.toBe('');
    });

    press('Escape', {}, within(dialog).getByRole('textbox', { name: 'Komu' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Nová správa' })).toBeNull();
    });
    expect(sidePane().closest('.app')?.classList.contains('composing')).toBe(false);
    await waitFor(() => {
      expect(contactHeading()?.textContent).toBe('Tomáš Baláž');
    });
    expect(within(sidePane()).queryByText('· adresát')).toBeNull();
  });

  it('lists threads where the recipient is any participant, not only the first contact', async () => {
    const { state, client } = seededClient();
    cloneThread(state, 'Obed v piatok?', 'shared', {
      subject: 'Spoločná porada',
      participants: [
        { name: 'Tomáš Baláž', email: 'tomas.balaz@firma.sk' },
        { name: 'Lucia Hrubá', email: 'Lucia.Hruba@firma.sk' },
        { name: 'Ty', email: 'meno@efabrica.sk' },
      ],
    });
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });

    press('c', {}, document.body);
    const dialog = screen.getByRole('dialog', { name: 'Nová správa' });
    act(() => {
      fireEvent.change(within(dialog).getByRole('textbox', { name: 'Komu' }), {
        target: { value: 'lucia.hruba@firma.sk, ' },
      });
    });

    await waitFor(() => {
      expect(sectionRows('Posledné konverzácie')).toContain('Spoločná porada');
    });
  });

  it('keeps the thread contact while the composer has no recipient', async () => {
    const { state, client } = seededClient();
    renderApp({ demo: () => client });
    await screen.findByRole('listbox', { name: 'Konverzácie' });
    showContactOf(threadIdOf(state, 'Obed v piatok?'));
    await waitFor(() => {
      expect(contactHeading()?.textContent).toBe('Tomáš Baláž');
    });

    press('c', {}, document.body);

    expect(screen.getByRole('dialog', { name: 'Nová správa' })).toBeDefined();
    expect(contactHeading()?.textContent).toBe('Tomáš Baláž');
    expect(within(sidePane()).queryByText('· adresát')).toBeNull();
  });
});
