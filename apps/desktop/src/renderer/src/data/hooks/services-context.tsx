import { createContext, type ReactNode, useContext } from 'react';
import type { Platform } from '../../platform/Platform';
import type { AppServices } from '../../session/services';
import type { SessionController } from '../../session/SessionController';
import type { MailClient } from '../MailClient';

export interface AppContextValue {
  readonly platform: Platform;
  readonly session: SessionController;
  readonly undoSendMs?: number;
  readonly now?: () => Date;
}

const AppContext = createContext<AppContextValue | null>(null);
const ServicesContext = createContext<AppServices | null>(null);

export function AppContextProvider({
  value,
  children,
}: {
  readonly value: AppContextValue;
  readonly children: ReactNode;
}) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function ServicesProvider({
  services,
  children,
}: {
  readonly services: AppServices;
  readonly children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export const useAppContext = (): AppContextValue => {
  const value = useContext(AppContext);
  if (value === null) {
    throw new Error('AppContextProvider chýba');
  }
  return value;
};

export const useServices = (): AppServices => {
  const value = useContext(ServicesContext);
  if (value === null) {
    throw new Error('ServicesProvider chýba');
  }
  return value;
};

export const useClient = (): MailClient => useServices().client;
