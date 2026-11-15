import type { RelayBridge } from '@relay/shared/ipc';
import { Placeholder } from '@relay/ui';
import { useAppInfo } from './use-app-info';

export interface AppProps {
  readonly bridge: RelayBridge | null;
}

const describe = (bridge: RelayBridge | null, version: string | undefined): string => {
  if (bridge === null) {
    return 'Webový režim - rozhranie Electronu nie je dostupné.';
  }
  if (version === undefined) {
    return 'Načítavam...';
  }
  return `Verzia ${version}`;
};

export function App({ bridge }: AppProps) {
  const appInfo = useAppInfo(bridge);
  return <Placeholder title="Relay" description={describe(bridge, appInfo.data?.version)} />;
}
