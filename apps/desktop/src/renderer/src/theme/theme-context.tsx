import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { ThemePreference } from '@relay/shared';
import type { ThemeController } from './theme-controller';

const ThemeContext = createContext<ThemeController | null>(null);

export function ThemeProvider({
  controller,
  children,
}: {
  readonly controller: ThemeController;
  readonly children: ReactNode;
}) {
  return <ThemeContext.Provider value={controller}>{children}</ThemeContext.Provider>;
}

export const useThemeController = (): ThemeController => {
  const controller = useContext(ThemeContext);
  if (controller === null) {
    throw new Error('ThemeProvider chýba');
  }
  return controller;
};

export const useThemePreference = (): ThemePreference => {
  const controller = useThemeController();
  return useSyncExternalStore(controller.subscribe, controller.current);
};
