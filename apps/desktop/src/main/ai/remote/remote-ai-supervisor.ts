import type { Logger } from '@relay/engine';
import type { DeviceSettings } from '@relay/shared/domain';
import type { RemoteAiConnection } from './remote-ai-connection';
import {
  type RemoteAiStatusListener,
  type RemoteAiWorkerStatus,
  STOPPED_STATUS,
} from './remote-ai-worker-status';
import { canonicalServerUrl } from './server-session-key';

export interface DeviceSettingsSource {
  get(): Promise<DeviceSettings>;
  onChange(listener: (settings: DeviceSettings) => void): () => void;
}

export type RemoteAiConnector = (
  serverUrl: string,
  onStatus: RemoteAiStatusListener,
) => RemoteAiConnection;

const syncedServer = (settings: DeviceSettings): string | null =>
  settings.mode === 'synced' && settings.activeServerUrl !== null
    ? canonicalServerUrl(settings.activeServerUrl)
    : null;

export class RemoteAiSupervisor {
  private connection: RemoteAiConnection | null = null;
  private unsubscribe: (() => void) | null = null;
  private transition: Promise<void> = Promise.resolve();
  private current: RemoteAiWorkerStatus = STOPPED_STATUS;

  constructor(
    private readonly settings: DeviceSettingsSource,
    private readonly connect: RemoteAiConnector,
    private readonly logger: Logger,
  ) {}

  get status(): RemoteAiWorkerStatus {
    return this.current;
  }

  async start(): Promise<void> {
    this.unsubscribe ??= this.settings.onChange((settings) => {
      void this.apply(syncedServer(settings));
    });
    await this.apply(syncedServer(await this.settings.get()));
  }

  wake(): void {
    this.connection?.wake();
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.enqueue(() => this.disconnect());
  }

  private apply(serverUrl: string | null): Promise<void> {
    return this.enqueue(async () => {
      if (this.connection?.serverUrl === serverUrl) {
        return;
      }
      await this.disconnect();
      if (serverUrl === null) {
        return;
      }
      const connection = this.connect(serverUrl, (status) => {
        if (this.connection === connection) {
          this.current = status;
        }
      });
      this.connection = connection;
      connection.start();
    }).catch((error: unknown) => {
      this.logger.error('Failed to switch the remote AI worker', { serverUrl, error });
    });
  }

  private async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.current = STOPPED_STATUS;
    await connection?.stop();
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    this.transition = this.transition.then(step, step);
    return this.transition;
  }
}
