import type { RelayBridge } from '@relay/shared/ipc';

export interface BridgeHost {
  readonly relay?: RelayBridge;
}

export const getRelayBridge = (host: BridgeHost = window): RelayBridge | null => host.relay ?? null;
