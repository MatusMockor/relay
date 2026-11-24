import {
  setUi,
  type TaskSystemConnectDraft,
  type UiState,
  useUiStore,
} from '../../../state/ui-store';

const draftOf = (state: UiState): TaskSystemConnectDraft | null =>
  state.overlay?.kind === 'settings' && state.overlay.section === 'taskSystems'
    ? (state.overlay.connect ?? null)
    : null;

export const useConnectDraft = (): TaskSystemConnectDraft | null => useUiStore(draftOf);

export const showConnectForm = (draft: TaskSystemConnectDraft | null): void => {
  setUi((state) =>
    state.overlay?.kind === 'settings'
      ? { overlay: { ...state.overlay, connect: draft ?? undefined } }
      : {},
  );
};
