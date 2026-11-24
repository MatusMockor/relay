import { readFile } from 'node:fs/promises';
import { THEME_PREFERENCES } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  nativeThemeSource,
  themeQuery,
  WINDOW_BACKGROUNDS,
  windowBackground,
  withThemeQuery,
} from '../../src/main/window/window-theme';

const themeStylesheet = (theme: string) =>
  readFile(
    new URL(`../../../../packages/ui/src/styles/themes/${theme}.css`, import.meta.url),
    'utf8',
  );

describe('window theme', () => {
  it('maps every preference to the native theme source', () => {
    expect(THEME_PREFERENCES.map(nativeThemeSource)).toEqual([
      'system',
      'dark',
      'light',
      'dark',
      'dark',
      'light',
    ]);
  });

  it('paints the window with the background of the resolved theme', () => {
    expect(windowBackground('dark', false)).toBe('#0b0d12');
    expect(windowBackground('paper', true)).toBe('#f3efe6');
    expect(windowBackground('system', true)).toBe('#0b0d12');
    expect(windowBackground('system', false)).toBe('#f5f6f8');
  });

  it.each(Object.entries(WINDOW_BACKGROUNDS))(
    'matches the %s palette background in the stylesheet',
    async (theme, color) => {
      const css = await themeStylesheet(theme);
      expect(css).toContain(`--bg: ${color};`);
    },
  );

  it('hands the preference to the renderer in the document query', () => {
    expect(themeQuery('dim')).toEqual({ theme: 'dim' });
    expect(withThemeQuery('http://localhost:5173', 'light')).toBe(
      'http://localhost:5173/?theme=light',
    );
    expect(withThemeQuery('http://localhost:5173/?theme=dark#x', 'paper')).toBe(
      'http://localhost:5173/?theme=paper#x',
    );
  });
});
