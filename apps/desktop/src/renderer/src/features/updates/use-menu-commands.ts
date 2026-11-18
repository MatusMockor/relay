import type { MenuCommandKind } from '@relay/shared';
import { useEffect } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { openAboutUnlessBusy } from './open-about';

const COMMANDS: Readonly<Record<MenuCommandKind, () => void>> = {
  'open-about': openAboutUnlessBusy,
};

export const useMenuCommands = (): void => {
  const { platform } = useAppContext();
  useEffect(
    () =>
      platform.subscribeToMenuCommands((command) => {
        COMMANDS[command]();
      }),
    [platform],
  );
};
