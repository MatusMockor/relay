import { transferableAbortController } from 'node:util';

const nativeController = transferableAbortController();

const restore = (name: 'AbortController' | 'AbortSignal', value: unknown): void => {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
    enumerable: false,
  });
};

restore('AbortController', nativeController.constructor);
restore('AbortSignal', nativeController.signal.constructor);
