const TOO_MANY_CONNECTIONS = '53300';
const CANNOT_CONNECT_NOW = '57P03';
const ATTEMPTS = 6;
const FIRST_BACKOFF_MS = 250;

const codeOf = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

export const isTransientPostgresError = (error: unknown): boolean => {
  const code = codeOf(error);
  return code === TOO_MANY_CONNECTIONS || code === CANNOT_CONNECT_NOW;
};

export const TRANSIENT_POSTGRES_LOG = /too many clients|remaining connection slots/i;

export const backoff = (attempt: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, FIRST_BACKOFF_MS * 2 ** attempt);
  });

export const withPostgresRetry = async <Result>(
  work: () => Promise<Result>,
  attempt = 0,
): Promise<Result> => {
  const pending = work();
  const retry = await pending.then(
    () => false,
    (error: unknown) => isTransientPostgresError(error) && attempt < ATTEMPTS - 1,
  );
  if (!retry) {
    return pending;
  }
  await backoff(attempt);
  return withPostgresRetry(work, attempt + 1);
};
