export type RestartStrategy =
  | { readonly kind: 'updater' }
  | {
      readonly kind: 'relaunch-after-exit';
      readonly executable: string;
      readonly relaunch: (executable: string) => void;
    };

export const UPDATER_RESTARTS: RestartStrategy = { kind: 'updater' };
