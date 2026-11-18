import { hasOpenLayer } from '@relay/ui';
import { useUiStore } from '../../state/ui-store';
import { goBack } from './navigation';

const covered = (): boolean => hasOpenLayer() || useUiStore.getState().overlay !== null;

export const navigateBack = (): void => {
  if (covered()) {
    return;
  }
  goBack();
};
