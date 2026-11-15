export interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

export const createDeferred = (): Deferred => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

export const nextTick = (): Promise<void> =>
  new Promise((done) => {
    setTimeout(done, 5);
  });
