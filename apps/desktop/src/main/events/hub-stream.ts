import type { EventHub } from './event-hub';

const DEFAULT_MAX_BUFFERED = 1_000;

export async function* streamHub<Event>(
  hub: EventHub<Event>,
  signal: AbortSignal,
  maxBuffered = DEFAULT_MAX_BUFFERED,
  seed: () => readonly Event[] = () => [],
): AsyncGenerator<Event> {
  const buffer: Event[] = [];
  let wake: (() => void) | null = null;
  const notify = () => {
    const resolve = wake;
    wake = null;
    resolve?.();
  };
  const unsubscribe = hub.subscribe((event) => {
    if (buffer.length >= maxBuffered) {
      buffer.shift();
    }
    buffer.push(event);
    notify();
  });
  buffer.push(...seed());
  signal.addEventListener('abort', notify, { once: true });
  try {
    while (!signal.aborted) {
      const next = buffer.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
  } finally {
    unsubscribe();
    signal.removeEventListener('abort', notify);
  }
}
