import { hasOpenLayer } from '@relay/ui';
import { useUiStore } from '../../state/ui-store';
import { runBackGuards } from './back-guards';
import { type BackSource, claimBackPress } from './back-press-gate';
import { goBack } from './navigation';

const covered = (): boolean => hasOpenLayer() || useUiStore.getState().overlay !== null;

export const navigateBack = (source: BackSource): void => {
  if (covered() || !claimBackPress(source)) {
    return;
  }
  runBackGuards();
  goBack();
};
