export interface Gate {
  readonly wait: () => Promise<void>;
  readonly open: () => void;
}

export const gate = (): Gate => {
  let release: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait: () => opened, open: release };
};
