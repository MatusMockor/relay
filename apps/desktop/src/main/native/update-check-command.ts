import type { Logger } from '@relay/engine';

export interface UpdateChecker {
  check(): Promise<void>;
}

export interface UpdateCheckCommandDeps {
  readonly updates: UpdateChecker;
  readonly showWindow: () => void;
  readonly openAbout: () => void;
  readonly logger: Logger;
}

export const createUpdateCheckCommand = (deps: UpdateCheckCommandDeps) => (): void => {
  deps.showWindow();
  deps.openAbout();
  deps.updates.check().catch((error: unknown) => {
    deps.logger.warn('The manual update check failed', { error });
  });
};
