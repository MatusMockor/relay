import { setUi } from '../../state/ui-store';
import { isControlTarget } from '../keyboard/focus-target';
import type { SearchPaletteModel } from './use-search-palette';

export const paletteKeyHandler =
  (model: SearchPaletteModel, input: () => HTMLInputElement | null) =>
  (event: KeyboardEvent): boolean => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'k') {
      event.preventDefault();
      setUi({ overlay: { kind: 'palette' } });
      return true;
    }
    if (mod && key === 'f') {
      event.preventDefault();
      input()?.select();
      return true;
    }
    const down = event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n');
    const up = event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p');
    if (down || up) {
      event.preventDefault();
      model.move(down ? 1 : -1);
      return true;
    }
    if (event.key !== 'Enter' || isControlTarget(event.target)) {
      return false;
    }
    event.preventDefault();
    if (mod) {
      model.showAll();
      return true;
    }
    model.pick(model.active);
    return true;
  };
