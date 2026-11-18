import { composeOverlay } from '../../state/compose-overlay';
import type { MenuCommand, SettingsSection } from '@relay/shared';
import { navigateBack } from '../mail/navigate-back';
import { selectScope } from '../mail/navigation';
import { setUi, useUiStore } from '../../state/ui-store';
import { openAboutUnlessBusy } from './open-about';

const composing = (): boolean => useUiStore.getState().overlay?.kind === 'compose';

const openSettingsUnlessComposing = (section: SettingsSection): void => {
  if (composing()) {
    return;
  }
  setUi({ overlay: { kind: 'settings', section, adding: false } });
};

const composeUnlessComposing = (): void => {
  if (composing()) {
    return;
  }
  setUi({ overlay: composeOverlay({}) });
};

export const menuCommandAction = (command: MenuCommand): (() => void) => {
  if (command.command === 'open-settings') {
    return () => {
      openSettingsUnlessComposing(command.section);
    };
  }
  if (command.command === 'compose') {
    return composeUnlessComposing;
  }
  if (command.command === 'select-scope') {
    return () => {
      selectScope(command.scope);
    };
  }
  if (command.command === 'navigate-back') {
    return () => {
      navigateBack('command');
    };
  }
  return openAboutUnlessBusy;
};
