import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getRelayBridge } from './bridge';

const container = document.getElementById('root');

if (container !== null) {
  const queryClient = new QueryClient();
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App bridge={getRelayBridge()} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
