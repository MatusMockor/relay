import { type OverlayState, setUi } from '../../state/ui-store';

export const closeOverlay = (origin: OverlayState) => (): void => {
  setUi((state) => (state.overlay === origin ? { overlay: null } : {}));
};
