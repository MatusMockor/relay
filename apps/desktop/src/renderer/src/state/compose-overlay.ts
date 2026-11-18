import { type ComposeInit, type OverlayState, useUiStore } from './ui-store';

export const composeOverlay = (init: ComposeInit): OverlayState => ({
  kind: 'compose',
  init,
  scope: useUiStore.getState().scope,
});
