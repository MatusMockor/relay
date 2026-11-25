// @vitest-environment jsdom
import type { AiRunRequest } from '@relay/shared';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ask,
  click,
  modelTrigger,
  openAiPane,
  openModelMenu,
  press,
  questionInput,
  reasoningTrigger,
  recordingClient,
} from './support/chat-composer';
import { renderApp, resetStores } from './support/render-app';

describe('AI chat composer keys and focus', () => {
  const requests: AiRunRequest[] = [];

  beforeEach(() => {
    resetStores();
    requests.length = 0;
    renderApp({ demo: () => recordingClient(requests) });
  });

  afterEach(() => {
    resetStores();
  });

  it('does not submit while an IME is composing the question', async () => {
    const pane = openAiPane();
    const input = questionInput(pane);
    fireEvent.change(input, { target: { value: 'Zhrň' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    });

    expect(requests).toHaveLength(0);
    expect(input).toHaveProperty('value', 'Zhrň');
    expect(await ask(pane, 'Zhrň neprečítané', requests)).toMatchObject({
      input: { question: 'Zhrň neprečítané' },
    });
  });

  it('ignores number keys held with Ctrl, Meta or Alt in the model menu', () => {
    const pane = openAiPane();
    openModelMenu(pane);
    press('2', { ctrlKey: true });
    press('2', { metaKey: true });
    press('2', { altKey: true });

    expect(screen.getByRole('dialog', { name: 'Výber modelu' })).toBeTruthy();
    expect(modelTrigger(pane).getAttribute('aria-label')).toBe('Model: Claude Code, Opus 5.5');
  });

  it('leaves keys typed outside an open menu to their own control', async () => {
    const pane = openAiPane();
    click(reasoningTrigger(pane));
    const input = questionInput(pane);
    fireEvent.change(input, { target: { value: 'Zhrň neprečítané' } });
    act(() => {
      input.focus();
    });
    press('ArrowDown');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(Object.keys(requests[0] ?? {})).toEqual(['input']);
  });

  it('dismisses an open menu without taking focus back when focus moves out of it', () => {
    const pane = openAiPane();
    const menu = openModelMenu(pane);
    const reasoning = reasoningTrigger(pane);
    act(() => {
      fireEvent.blur(within(menu).getByRole('option', { name: /^Opus 5\.5/ }), {
        relatedTarget: reasoning,
      });
      reasoning.focus();
    });

    expect(screen.queryByRole('dialog', { name: 'Výber modelu' })).toBeNull();
    expect(document.activeElement).toBe(reasoning);
    click(reasoning);
    expect(screen.getByRole('menu', { name: 'Reasoning' })).toBeTruthy();
    press('Escape');
    expect(screen.queryByRole('menu', { name: 'Reasoning' })).toBeNull();
  });
});
