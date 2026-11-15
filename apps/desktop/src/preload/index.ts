import { RELAY_BRIDGE_KEY } from '@relay/shared/ipc';
import { contextBridge, ipcRenderer } from 'electron';
import { createRelayBridge } from './create-bridge';

contextBridge.exposeInMainWorld(
  RELAY_BRIDGE_KEY,
  createRelayBridge(ipcRenderer, () => crypto.randomUUID()),
);
