// @vitest-environment jsdom
import type { AiRunRequest } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import type { MailClient } from '../src/data/MailClient';
import { renderApp, resetStores } from './support/render-app';

const recordingClient = (requests: AiRunRequest[]): MailClient => {
  const base = createDemoMailClient({ aiStepMs: 0 });
  return {
    ...base,
    runAi: (request, listener) => {
      requests.push(request);
      return base.runAi(request, listener);
    },
  };
};

const openAiPane = () => {
  act(() => {
    fireEvent.click(screen.getByRole('tab', { name: /^AI/ }));
  });
  return screen.getByRole('tabpanel', { name: 'AI' });
};

const modelTrigger = (pane: HTMLElement) => within(pane).getByRole('button', { name: /^Model: / });

const reasoningTrigger = (pane: HTMLElement) =>
  within(pane).getByRole('button', { name: /^Reasoning: / });

const click = (element: HTMLElement) => {
  act(() => {
    fireEvent.click(element);
  });
};

const press = (key: string) => {
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key });
  });
};

const openModelMenu = (pane: HTMLElement) => {
  click(modelTrigger(pane));
  return screen.getByRole('dialog', { name: 'Výber modelu' });
};

const listedModels = (menu: HTMLElement): string[] =>
  within(within(menu).getByRole('radiogroup', { name: 'Model' }))
    .getAllByRole('radio')
    .map((row) => row.querySelector('.nm')?.textContent ?? '');

const ask = async (pane: HTMLElement, question: string, requests: AiRunRequest[]) => {
  const count = requests.length;
  const input = within(pane).getByRole('textbox', { name: 'Otázka pre AI' });
  fireEvent.change(input, { target: { value: question } });
  act(() => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
  await waitFor(() => {
    expect(requests).toHaveLength(count + 1);
  });
  return requests[count];
};

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

  it('replaces the runner toggle with a model trigger and runs on the default model', async () => {
    const pane = openAiPane();

    expect(within(pane).queryByRole('group', { name: 'Spustiť cez' })).toBeNull();
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Opus 5.5');
    expect(reasoningTrigger(pane).textContent).toBe('Stredný');
    expect(await ask(pane, 'Čo dnes vybaviť?', requests)).toMatchObject({
      input: { kind: 'chatAnswer', question: 'Čo dnes vybaviť?' },
      runner: 'claude',
      model: null,
      effort: null,
    });
  });

  it('lists the models of the clicked provider and runs the picked model', async () => {
    const pane = openAiPane();
    const menu = openModelMenu(pane);
    expect(listedModels(menu)).toEqual(['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']);
    expect(
      within(menu)
        .getByRole('radio', { name: /^Opus 5\.5/ })
        .getAttribute('aria-checked'),
    ).toBe('true');

    click(within(menu).getByRole('button', { name: 'Codex' }));

    expect(listedModels(menu)).toEqual(['GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6 Luna']);
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Opus 5.5');
    click(within(menu).getByRole('radio', { name: /^GPT-6 Astra/ }));

    expect(screen.queryByRole('dialog', { name: 'Výber modelu' })).toBeNull();
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Codex, GPT-6 Astra');
    expect(await ask(pane, 'Zhrň neprečítané', requests)).toMatchObject({
      runner: 'codex',
      model: 'gpt-6-astra',
      effort: null,
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
      model: null,
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
    const opus = within(menu).getByRole('radio', { name: /^Opus 5\.5/ });
    expect(document.activeElement).toBe(opus);
    expect(opus.tabIndex).toBe(0);

    const sonnet = within(menu).getByRole('radio', { name: /^Sonnet 5\.5/ });
    act(() => {
      sonnet.focus();
    });
    expect(sonnet.classList.contains('on')).toBe(true);
    press('ArrowDown');

    const haiku = within(menu).getByRole('radio', { name: /^Haiku 5\.5/ });
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

  it('drops an effort the newly picked model does not support', () => {
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
