// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NoHits } from '../src/features/list/EmptyState';
import { resetStores } from './support/render-app';

const keysIn = (element: Element): (string | null)[] =>
  [...element.querySelectorAll('.kbd')].map((key) => key.textContent);

describe('shortcut hints next to user text', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    cleanup();
    resetStores();
  });

  it('keeps brackets in the search query as plain text', () => {
    const { container } = render(<NoHits query="[urgent" />);
    const paragraph = container.querySelector('p');

    expect(paragraph?.textContent).toContain('Pre „[urgent“ tu nie je žiadna konverzácia.');
    expect(paragraph === null ? [] : keysIn(paragraph)).toEqual(['Esc']);
  });
});
