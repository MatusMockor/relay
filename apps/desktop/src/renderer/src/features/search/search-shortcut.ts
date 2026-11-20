import { IS_MAC } from '../../lib/platform-keys';

export const isSearchShortcut = (event: KeyboardEvent): boolean => {
  const mod = IS_MAC ? event.metaKey : event.ctrlKey;
  return (
    mod &&
    !event.altKey &&
    !event.shiftKey &&
    (event.code === 'KeyF' || event.key.toLowerCase() === 'f')
  );
};
