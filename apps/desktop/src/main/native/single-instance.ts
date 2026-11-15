import { app } from 'electron';

export const acquireSingleInstance = (onSecondInstance: () => void): boolean => {
  if (!app.requestSingleInstanceLock()) {
    return false;
  }
  app.on('second-instance', onSecondInstance);
  return true;
};
