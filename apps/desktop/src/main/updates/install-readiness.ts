export interface ReadinessWatch {
  readonly staged: Promise<void>;
  arm(): void;
  cancel(): void;
}

export interface InstallReadiness {
  watch(): ReadinessWatch;
}

export const DOWNLOAD_IS_READY: InstallReadiness = {
  watch: () => ({
    staged: Promise.resolve(),
    arm: () => undefined,
    cancel: () => undefined,
  }),
};
