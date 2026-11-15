import { api, type AuthSession, ServerUrlSchema } from '@relay/shared';
import type { MailClient } from '../data/MailClient';
import { checkServerHealth } from '../data/remote/ServerApi';
import { deviceRegistrationOf, type Platform } from '../platform/Platform';
import {
  INITIAL_SESSION,
  type OnboardingStep,
  type SessionPhase,
  type SessionState,
  useSessionStore,
} from './session-store';
import {
  createOfflineServices,
  createServerApi,
  type ServerApiBundle,
  createSyncedServices,
  type ServiceHooks,
} from './services';

type Store = typeof useSessionStore;

const hasAnyAccount = async (
  list: () => ReturnType<MailClient['listAccounts']>,
): Promise<boolean> => {
  const accounts = await list().catch(() => []);
  return accounts.length > 0;
};

export interface Credentials {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
}

export type Teardown = () => Promise<void>;

export class SessionController {
  private readonly teardowns = new Set<Teardown>();
  private transition = 0;

  constructor(
    private readonly platform: Platform,
    private readonly store: Store = useSessionStore,
    private readonly hooks: Partial<ServiceHooks> = {},
  ) {}

  get state(): SessionState {
    return this.store.getState();
  }

  async boot(): Promise<void> {
    const settings = await this.platform.deviceSettings();
    if (settings.mode === 'local') {
      this.enterOffline();
      return;
    }
    if (settings.mode === 'synced' && settings.activeServerUrl !== null) {
      await this.enterServer(settings.activeServerUrl);
      return;
    }
    this.goTo('welcome');
  }

  goTo(step: OnboardingStep, pendingServerUrl: string | null = this.state.pendingServerUrl): void {
    this.nextTransition();
    this.dispose();
    this.store.setState({ ...INITIAL_SESSION, phase: 'onboarding', step, pendingServerUrl });
  }

  async continueOffline(): Promise<void> {
    const ticket = this.nextTransition();
    await this.platform.updateDeviceSettings({ mode: 'local' });
    if (!this.isCurrent(ticket)) {
      return;
    }
    this.enterOffline('booting');
    const services = this.state.services;
    if (services?.mode !== 'local') {
      this.store.setState({ phase: 'ready' });
      return;
    }
    const empty = !(await hasAnyAccount(() => services.client.listAccounts()));
    if (this.state.services?.client !== services.client) {
      return;
    }
    this.store.setState(empty ? { phase: 'onboarding', step: 'account' } : { phase: 'ready' });
  }

  async verifyServer(input: string): Promise<string> {
    const url = ServerUrlSchema.parse(input);
    const ticket = this.nextTransition();
    await checkServerHealth(url, this.hooks.fetch);
    if (!this.isCurrent(ticket)) {
      return url;
    }
    this.store.setState({ pendingServerUrl: url, step: 'auth' });
    return url;
  }

  async authenticate(kind: 'login' | 'register', credentials: Credentials): Promise<AuthSession> {
    const url = this.state.pendingServerUrl;
    if (url === null) {
      throw new Error('Najprv zadaj adresu servera');
    }
    const ticket = this.nextTransition();
    const bundle = this.serverApi(url);
    const { server } = bundle;
    const device = deviceRegistrationOf(await this.platform.appInfo(), this.platform.kind);
    const session =
      kind === 'register'
        ? await server.register(
            {
              email: credentials.email,
              password: credentials.password,
              displayName: credentials.displayName ?? credentials.email,
            },
            device,
          )
        : await server.login(credentials, device);
    const empty = !(await hasAnyAccount(() => bundle.http.call(api.accounts.list, {})));
    if (!this.isCurrent(ticket)) {
      return session;
    }
    await this.rememberServer(url, ticket);
    if (!this.isCurrent(ticket)) {
      return session;
    }
    this.enterSynced(url, session, bundle);
    if (empty) {
      this.store.setState({ phase: 'onboarding', step: 'account' });
    }
    return session;
  }

  finishOnboarding(): void {
    this.store.setState({ phase: 'ready' });
  }

  async switchServer(url: string): Promise<void> {
    const ticket = this.nextTransition();
    await this.platform.updateDeviceSettings({ activeServerUrl: url, mode: 'synced' });
    await this.enterServer(url, ticket);
  }

  addTeardown(teardown: Teardown): () => void {
    this.teardowns.add(teardown);
    return () => {
      this.teardowns.delete(teardown);
    };
  }

  async logout(): Promise<void> {
    const ticket = this.nextTransition();
    const services = this.state.services;
    await this.runTeardowns();
    if (!this.isCurrent(ticket) && this.state.services?.serverUrl === services?.serverUrl) {
      return;
    }
    await services?.server?.logout();
    if (!this.isCurrent(ticket)) {
      return;
    }
    await this.platform.updateDeviceSettings({ mode: null });
    if (!this.isCurrent(ticket)) {
      return;
    }
    this.goTo('welcome', null);
  }

  dispose(): void {
    void this.runTeardowns();
    this.state.services?.client.dispose();
  }

  private async runTeardowns(): Promise<void> {
    await Promise.all([...this.teardowns].map((teardown) => teardown()));
  }

  private nextTransition(): number {
    this.transition += 1;
    return this.transition;
  }

  private isCurrent(ticket: number): boolean {
    return ticket === this.transition;
  }

  private serverApi(url: string): ServerApiBundle {
    return createServerApi(this.platform, url, {
      fetch: this.hooks.fetch,
      onSessionExpired: () => {
        this.expireSession(url);
      },
    });
  }

  private expireSession(url: string): void {
    if (this.state.services?.serverUrl !== url) {
      return;
    }
    this.goTo('auth', url);
  }

  private async enterServer(url: string, ticket = this.nextTransition()): Promise<void> {
    const bundle = this.serverApi(url);
    const { server } = bundle;
    const signedIn = await server.hasSession();
    if (!this.isCurrent(ticket)) {
      return;
    }
    if (!signedIn) {
      this.goTo('auth', url);
      return;
    }
    this.enterSynced(url, null, bundle);
    const me = await server.me().catch(() => null);
    if (me === null || !this.isCurrent(ticket)) {
      return;
    }
    this.store.setState({ user: me.user, device: me.device });
  }

  private enterOffline(phase: SessionPhase = 'ready'): void {
    this.nextTransition();
    this.dispose();
    const services = createOfflineServices(this.platform, this.serviceHooks());
    this.store.setState({ ...INITIAL_SESSION, phase, services });
  }

  private enterSynced(url: string, session: AuthSession | null, bundle: ServerApiBundle): void {
    this.dispose();
    const services = createSyncedServices(url, bundle, this.serviceHooks());
    this.store.setState({
      ...INITIAL_SESSION,
      phase: 'ready',
      services,
      pendingServerUrl: url,
      user: session?.user ?? null,
      device: session?.device ?? null,
    });
  }

  private async rememberServer(url: string, ticket: number): Promise<void> {
    const settings = await this.platform.deviceSettings();
    if (!this.isCurrent(ticket)) {
      return;
    }
    const known = settings.savedServers.some((server) => server.url === url);
    const name = new URL(url).host;
    await this.platform.updateDeviceSettings({
      mode: 'synced',
      activeServerUrl: url,
      savedServers: known ? settings.savedServers : [...settings.savedServers, { name, url }],
    });
  }

  private serviceHooks(): ServiceHooks {
    return {
      ...this.hooks,
      onRealtimeStatus: (realtime) => {
        this.store.setState({ realtime });
      },
    };
  }
}
