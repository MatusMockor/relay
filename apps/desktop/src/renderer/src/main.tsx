import '@relay/ui/styles.css';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getRelayBridge } from './bridge';
import { createBrowserPlatform } from './platform/BrowserPlatform';
import { createPlatform } from './platform/ElectronPlatform';
import { SessionController } from './session/SessionController';

const container = document.getElementById('root');

if (container !== null) {
  const platform = createPlatform(getRelayBridge(), () => createBrowserPlatform());
  const session = new SessionController(platform);
  createRoot(container).render(
    <StrictMode>
      <App platform={platform} session={session} />
    </StrictMode>,
  );
}
