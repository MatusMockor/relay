import type { RelayBridge } from '@relay/shared/ipc';

declare global {
  interface Window {
    relay?: RelayBridge;
  }
}
