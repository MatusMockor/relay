import '@relay/ui/styles.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { openContextMenu } from './features/context-menu/context-menu-store';
import { getRelayBridge } from './bridge';
import { IS_MAC } from './lib/platform-keys';
import { createBrowserPlatform } from './platform/BrowserPlatform';
import { createPlatform } from './platform/ElectronPlatform';
import { applyWindowChrome } from './platform/window-chrome';
import { SessionController } from './session/SessionController';

const container = document.getElementById('root');

if (container !== null) {
  const platform = createPlatform(getRelayBridge(), () =>
    createBrowserPlatform(undefined, openContextMenu),
  );
  applyWindowChrome(document.documentElement, platform, IS_MAC);
  const session = new SessionController(platform);
  createRoot(container).render(
    <StrictMode>
      <App platform={platform} session={session} />
    </StrictMode>,
  );
}
