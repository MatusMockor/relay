import { openLayerCount } from '@relay/ui';
import { useUiStore } from '../../state/ui-store';
import { isTyping } from '../keyboard/key-handlers';
import { runBackGuards } from '../mail/back-guards';
import { appHistory } from './app-history';
import { claimHistoryPress, type PressSource } from './history-press-gate';
import { isTransientOverlay } from './nav-location';
import type { HistoryDirection } from './navigation-history';

const historyBlocked = (): boolean => {
  const { overlay } = useUiStore.getState();
  if (isTransientOverlay(overlay)) {
    return true;
  }
  const ownLayers = overlay?.kind === 'settings' ? 1 : 0;
  return openLayerCount() > ownLayers;
};

const blurEditedField = (): void => {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !isTyping(focused)) {
    return;
  }
  focused.blur();
};

export const canStepHistory = (direction: HistoryDirection): boolean =>
  !historyBlocked() && appHistory.can(direction);

export const stepHistory = (direction: HistoryDirection): void => {
  if (!canStepHistory(direction)) {
    return;
  }
  appHistory.go(direction, () => {
    blurEditedField();
    runBackGuards();
  });
};

export const pressHistory = (direction: HistoryDirection, source: PressSource): void => {
  if (historyBlocked() || !claimHistoryPress(direction, source)) {
    return;
  }
  stepHistory(direction);
};
