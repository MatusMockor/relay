import { setTimeout as sleep } from 'node:timers/promises';

const POLL_MS = 250;

export const eventually = async <Value>(
  read: () => Promise<Value>,
  accept: (value: Value) => boolean,
  timeoutMs = 20_000,
): Promise<Value> => {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!accept(value) && Date.now() < deadline) {
    await sleep(POLL_MS);
    value = await read();
  }
  return value;
};
