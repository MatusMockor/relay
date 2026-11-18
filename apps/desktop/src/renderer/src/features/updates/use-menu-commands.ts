import type { MenuCommandKind } from '@relay/shared';
import { useEffect } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { openAboutWhenReady } from './open-about-when-ready';

type MenuCommandHandler = () => () => void;

const COMMANDS: Readonly<Record<MenuCommandKind, MenuCommandHandler>> = {
  'open-about': openAboutWhenReady,
};

export const useMenuCommands = (): void => {
  const { platform } = useAppContext();
  useEffect(() => {
    const cancels = new Set<() => void>();
    const unsubscribe = platform.subscribeToMenuCommands((command) => {
      cancels.add(COMMANDS[command]());
    });
    return () => {
      unsubscribe();
      cancels.forEach((cancel) => {
        cancel();
      });
    };
  }, [platform]);
};
