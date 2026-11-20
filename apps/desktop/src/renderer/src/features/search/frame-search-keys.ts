import { hasOpenLayer } from '@relay/ui';
import { openSearchPalette } from './search-actions';
import { isSearchShortcut } from './search-shortcut';

const onKeyDown = (event: KeyboardEvent): void => {
  if (event.defaultPrevented || !isSearchShortcut(event) || hasOpenLayer()) {
    return;
  }
  event.preventDefault();
  openSearchPalette();
};

export const listenForSearchKeys = (target: Window): (() => void) => {
  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
};
