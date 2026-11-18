import { type OverlayState, setUi, useUiStore } from '../../state/ui-store';

const keepsOverlay = (overlay: OverlayState | null): boolean =>
  overlay?.kind === 'compose' || overlay?.kind === 'settings';

export const openAbout = (): void => {
  setUi({ overlay: { kind: 'settings', section: 'about', adding: false } });
};

export const openAboutUnlessBusy = (): void => {
  if (keepsOverlay(useUiStore.getState().overlay)) {
    return;
  }
  openAbout();
};
