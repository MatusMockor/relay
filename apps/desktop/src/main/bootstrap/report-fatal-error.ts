import { app, dialog } from 'electron';

export const reportFatalError = (error: unknown): void => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error('Relay failed to start', error);
  dialog.showErrorBox('Relay sa nepodarilo spustiť', detail);
  app.exit(1);
};
