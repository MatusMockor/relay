import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  type AppContextValue,
  AppContextProvider,
  ServicesProvider,
} from './data/hooks/services-context';
import { sendQueue } from './features/mail/send-queue';
import { AppShell } from './features/shell/AppShell';
import { resetChat } from './features/side/chat-store';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { useSessionStore } from './session/session-store';

export interface AppProps extends AppContextValue {
  readonly createQueryClient?: () => QueryClient;
}

const defaultQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
  });

function Root({ createQueryClient }: { readonly createQueryClient: () => QueryClient }) {
  const phase = useSessionStore((state) => state.phase);
  const services = useSessionStore((state) => state.services);
  const clients = useRef(new WeakMap<object, QueryClient>());
  const owner = services ?? clients;
  const queryClient = clients.current.get(owner) ?? createQueryClient();
  clients.current.set(owner, queryClient);
  if (phase === 'booting') {
    return (
      <div className="loading" role="status">
        Načítavam…
      </div>
    );
  }
  const content = phase === 'ready' && services !== null ? <AppShell /> : <OnboardingScreen />;
  return (
    <QueryClientProvider client={queryClient}>
      {services === null ? (
        content
      ) : (
        <ServicesProvider services={services}>{content}</ServicesProvider>
      )}
    </QueryClientProvider>
  );
}

export function App({ createQueryClient = defaultQueryClient, ...context }: AppProps) {
  useEffect(
    () =>
      context.session.addTeardown(async () => {
        resetChat();
        await sendQueue.flushAll();
      }),
    [context.session],
  );
  useEffect(() => {
    void context.session.boot();
    return () => {
      context.session.dispose();
    };
  }, [context.session]);
  return (
    <AppContextProvider value={context}>
      <Root createQueryClient={createQueryClient} />
    </AppContextProvider>
  );
}
