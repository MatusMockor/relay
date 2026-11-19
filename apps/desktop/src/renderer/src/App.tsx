import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  type AppContextValue,
  AppContextProvider,
  ServicesProvider,
} from './data/hooks/services-context';
import { resetContextMenu } from './features/context-menu/context-menu-store';
import { sendQueue } from './features/mail/send-queue';
import { AppShell } from './features/shell/AppShell';
import { useScopePersistence } from './features/shell/scope-persistence';
import { resetChat } from './features/side/chat-store';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { MenuCommandListener } from './features/updates/MenuCommandListener';
import { UpdatePrompt } from './features/updates/UpdatePrompt';
import { useSessionStore } from './session/session-store';

export interface AppProps extends AppContextValue {
  readonly createQueryClient?: () => QueryClient;
}

interface QueryClientSlot {
  readonly client: QueryClient;
  readonly key: number;
}

const defaultQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
  });

function Root({ createQueryClient }: { readonly createQueryClient: () => QueryClient }) {
  const phase = useSessionStore((state) => state.phase);
  const services = useSessionStore((state) => state.services);
  const slots = useRef(new WeakMap<object, QueryClientSlot>());
  const created = useRef(0);
  const owner = services ?? slots;
  const slot = slots.current.get(owner) ?? {
    client: createQueryClient(),
    key: (created.current += 1),
  };
  slots.current.set(owner, slot);
  if (phase === 'booting') {
    return (
      <>
        <div className="win-drag" />
        <div className="loading" role="status">
          Načítavam…
        </div>
      </>
    );
  }
  const content =
    phase === 'ready' && services !== null ? (
      <AppShell />
    ) : (
      <>
        <div className="win-drag" />
        <OnboardingScreen />
      </>
    );
  return (
    <QueryClientProvider key={slot.key} client={slot.client}>
      {services === null ? (
        content
      ) : (
        <ServicesProvider services={services}>{content}</ServicesProvider>
      )}
    </QueryClientProvider>
  );
}

export function App({ createQueryClient = defaultQueryClient, ...context }: AppProps) {
  useScopePersistence();
  useEffect(
    () =>
      context.session.addTeardown(async () => {
        resetChat();
        resetContextMenu();
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
      <UpdatePrompt />
      <MenuCommandListener />
    </AppContextProvider>
  );
}
