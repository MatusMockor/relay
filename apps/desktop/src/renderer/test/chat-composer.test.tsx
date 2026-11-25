// @vitest-environment jsdom
import type { AiRunRequest } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ask,
  click,
  listedModels,
  modelTrigger,
  openAiPane,
  openModelMenu,
  press,
  reasoningTrigger,
  recordingClient,
} from './support/chat-composer';
import { renderApp, resetStores } from './support/render-app';

describe('AI chat composer', () => {
  const requests: AiRunRequest[] = [];

  beforeEach(() => {
    resetStores();
    requests.length = 0;
    renderApp({ demo: () => recordingClient(requests) });
  });

  afterEach(() => {
    resetStores();
  });

  it('shows the settings model and leaves it to the engine until the user picks another', async () => {
    const pane = openAiPane();

    expect(within(pane).queryByRole('group', { name: 'Spustiť cez' })).toBeNull();
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Opus 5.5');
    expect(reasoningTrigger(pane).textContent).toBe('Stredný');
    const request = await ask(pane, 'Čo dnes vybaviť?', requests);
    expect(request).toMatchObject({ input: { kind: 'chatAnswer', question: 'Čo dnes vybaviť?' } });
    expect(Object.keys(request ?? {})).toEqual(['input']);
  });

  it('runs the default reasoning of a picked model without touching the reasoning menu', async () => {
    const pane = openAiPane();
    click(within(openModelMenu(pane)).getByRole('button', { name: 'Codex' }));
    press('1');

    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Codex, GPT-6.1 Sol');
    expect(reasoningTrigger(pane).textContent).toBe('Stredný');
    expect(await ask(pane, 'Zhrň neprečítané', requests)).toMatchObject({
      runner: 'codex',
      model: 'gpt-6.1-sol',
      effort: 'medium',
    });
  });

  it('lists the models of the clicked provider and runs the picked model', async () => {
    const pane = openAiPane();
    const menu = openModelMenu(pane);
    expect(listedModels(menu)).toEqual(['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']);
    expect(
      within(menu)
        .getByRole('option', { name: /^Opus 5\.5/ })
        .getAttribute('aria-selected'),
    ).toBe('true');

    click(within(menu).getByRole('button', { name: 'Codex' }));

    expect(listedModels(menu)).toEqual(['GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6 Luna']);
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Opus 5.5');
    click(within(menu).getByRole('option', { name: /^GPT-6 Astra/ }));

    expect(screen.queryByRole('dialog', { name: 'Výber modelu' })).toBeNull();
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Codex, GPT-6 Astra');
    expect(await ask(pane, 'Zhrň neprečítané', requests)).toMatchObject({
      runner: 'codex',
      model: 'gpt-6-astra',
      effort: 'medium',
    });
  });

  it('changes the reasoning effort and sends it with the next question', async () => {
    const pane = openAiPane();
    click(reasoningTrigger(pane));
    const menu = screen.getByRole('menu', { name: 'Reasoning' });
    const items = within(menu).getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual([
      'Nízky',
      'Strednýpredvolený',
      'Vysoký',
      'Veľmi vysoký',
      'Max',
    ]);
    expect(items[1]?.getAttribute('aria-checked')).toBe('true');

    click(within(menu).getByRole('menuitemradio', { name: 'Vysoký' }));

    expect(screen.queryByRole('menu', { name: 'Reasoning' })).toBeNull();
    expect(reasoningTrigger(pane).textContent).toBe('Vysoký');
    expect(await ask(pane, 'Čo dnes vybaviť?', requests)).toMatchObject({
      runner: 'claude',
      model: 'claude-opus-5-5',
      effort: 'high',
    });
  });

  it('selects models with number keys and with arrows plus Enter', () => {
    const pane = openAiPane();
    openModelMenu(pane);
    press('3');

    expect(screen.queryByRole('dialog', { name: 'Výber modelu' })).toBeNull();
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Haiku 5.5');

    openModelMenu(pane);
    press('ArrowDown');
    press('Enter');

    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Opus 5.5');
  });

  it('keeps focus, highlight and activation on the same menu item', () => {
    const pane = openAiPane();
    const menu = openModelMenu(pane);
    const opus = within(menu).getByRole('option', { name: /^Opus 5\.5/ });
    expect(document.activeElement).toBe(opus);
    expect(opus.tabIndex).toBe(0);

    const sonnet = within(menu).getByRole('option', { name: /^Sonnet 5\.5/ });
    act(() => {
      sonnet.focus();
    });
    expect(sonnet.classList.contains('on')).toBe(true);
    press('ArrowDown');

    const haiku = within(menu).getByRole('option', { name: /^Haiku 5\.5/ });
    expect(document.activeElement).toBe(haiku);
    expect([opus.tabIndex, sonnet.tabIndex, haiku.tabIndex]).toEqual([-1, -1, 0]);
    press('Enter');

    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Haiku 5.5');
  });

  it('keeps the question input out of an open menu and never submits from it', () => {
    const pane = openAiPane();
    fireEvent.change(within(pane).getByRole('textbox', { name: 'Otázka pre AI' }), {
      target: { value: 'Zhrň neprečítané' },
    });
    click(reasoningTrigger(pane));
    const menu = screen.getByRole('menu', { name: 'Reasoning' });
    act(() => {
      fireEvent.mouseDown(within(menu).getByText('Reasoning'));
    });

    expect(document.activeElement?.id).not.toBe('chat-q');
    press('ArrowDown');
    press('Enter');

    expect(screen.queryByRole('menu', { name: 'Reasoning' })).toBeNull();
    expect(reasoningTrigger(pane).textContent).toBe('Vysoký');
    expect(requests).toHaveLength(0);
  });

  it('marks the listed provider with aria-pressed', () => {
    const menu = openModelMenu(openAiPane());
    const providers = within(menu).getByRole('group', { name: 'Poskytovateľ' });
    const pressed = () =>
      within(providers)
        .getAllByRole('button')
        .map((button) => [button.getAttribute('aria-label'), button.getAttribute('aria-pressed')]);
    expect(pressed()).toEqual([
      ['Claude Code', 'true'],
      ['Codex', 'false'],
    ]);

    click(within(providers).getByRole('button', { name: 'Codex' }));

    expect(pressed()).toEqual([
      ['Claude Code', 'false'],
      ['Codex', 'true'],
    ]);
  });

  it('drops an effort the newly picked model does not support', async () => {
    const pane = openAiPane();
    click(reasoningTrigger(pane));
    click(
      within(screen.getByRole('menu', { name: 'Reasoning' })).getByRole('menuitemradio', {
        name: 'Max',
      }),
    );
    const menu = openModelMenu(pane);
    click(within(menu).getByRole('button', { name: 'Codex' }));
    press('1');

    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Codex, GPT-6.1 Sol');
    expect(reasoningTrigger(pane).textContent).toBe('Stredný');
    expect(await ask(pane, 'Zhrň neprečítané', requests)).toMatchObject({
      runner: 'codex',
      model: 'gpt-6.1-sol',
      effort: 'medium',
    });
  });

  it('keeps the picked model and reasoning when the AI tab is hidden and shown again', () => {
    let pane = openAiPane();
    click(within(openModelMenu(pane)).getByRole('button', { name: 'Codex' }));
    press('2');
    click(reasoningTrigger(pane));
    click(
      within(screen.getByRole('menu', { name: 'Reasoning' })).getByRole('menuitemradio', {
        name: 'Vysoký',
      }),
    );

    click(screen.getByRole('tab', { name: /^Kalendár/ }));
    expect(screen.queryByRole('tabpanel', { name: 'AI' })).toBeNull();
    pane = openAiPane();

    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Codex, GPT-6 Astra');
    expect(reasoningTrigger(pane).textContent).toBe('Vysoký');
  });

  it('submits with the send button only when there is a question', async () => {
    const pane = openAiPane();
    const send = within(pane).getByRole('button', { name: 'Odoslať otázku' });
    fireEvent.change(within(pane).getByRole('textbox', { name: 'Otázka pre AI' }), {
      target: { value: '  ' },
    });
    expect(send.hasAttribute('disabled')).toBe(true);

    fireEvent.change(within(pane).getByRole('textbox', { name: 'Otázka pre AI' }), {
      target: { value: 'Zhrň neprečítané' },
    });
    click(send);

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]?.input).toMatchObject({ kind: 'chatAnswer', question: 'Zhrň neprečítané' });
  });
});
