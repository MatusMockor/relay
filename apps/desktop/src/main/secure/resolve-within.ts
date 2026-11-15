export const resolveWithin = <Value>(
  promise: Promise<Value>,
  timeoutMs: number,
  fallback: Value,
): Promise<Value> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(fallback);
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
