import { useEffect } from 'react';
import { useAppContext } from '../../data/hooks/services-context';
import { menuCommandAction } from './menu-command-actions';
import { whenSessionReady } from './when-session-ready';

export const useMenuCommands = (): void => {
  const { platform } = useAppContext();
  useEffect(() => {
    const cancels = new Set<() => void>();
    const unsubscribe = platform.subscribeToMenuCommands((command) => {
      cancels.add(whenSessionReady(menuCommandAction(command)));
    });
    return () => {
      unsubscribe();
      cancels.forEach((cancel) => {
        cancel();
      });
    };
  }, [platform]);
};
