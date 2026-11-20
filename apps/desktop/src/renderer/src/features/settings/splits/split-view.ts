import { setUi, type UiState, useUiStore } from '../../../state/ui-store';

const splitOf = (state: UiState): string | null =>
  state.overlay?.kind === 'settings' && state.overlay.section === 'splits'
    ? (state.overlay.split ?? null)
    : null;

export const useOpenedSplit = (): string | null => useUiStore(splitOf);

export const showSplit = (splitId: string | null): void => {
  setUi((state) =>
    state.overlay?.kind === 'settings'
      ? { overlay: { ...state.overlay, split: splitId ?? undefined } }
      : {},
  );
};

export const openSplitEditor = (splitId: string): void => {
  setUi({ overlay: { kind: 'settings', section: 'splits', adding: false, split: splitId } });
};
