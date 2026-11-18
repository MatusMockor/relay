// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VIEW_META } from '../src/state/folders';
import { setUi } from '../src/state/ui-store';
import { demoClient } from './features-support';
import { renderApp, resetStores } from './support/render-app';

describe('folder title', () => {
  beforeEach(() => {
    resetStores();
  });
  afterEach(() => {
    resetStores();
  });

  it.each(['spam', 'trash', 'done', 'sent', 'drafts'] as const)(
    'shows only the folder name without a subtitle in %s',
    async (view) => {
      renderApp({ demo: demoClient });
      await screen.findByRole('listbox', { name: 'Konverzácie' });

      act(() => {
        setUi({ folder: { kind: 'view', view } });
      });

      const heading = await screen.findByRole('heading', { level: 2 });
      expect(heading.textContent).toContain(VIEW_META[view].label);
      const title = heading.closest('.a-title');
      expect(title?.children).toHaveLength(1);
      expect(title?.querySelector('.sub')).toBeNull();
      expect(title?.querySelector('.kbd')).toBeNull();
      expect(title?.textContent).not.toContain('všetky účty');
    },
  );
});
