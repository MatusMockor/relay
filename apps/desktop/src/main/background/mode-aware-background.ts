import type { Logger } from '@relay/engine';
import type { AppMode, DeviceSettings } from '@relay/shared/domain';
import type { DeviceSettingsStore } from '../settings/device-settings-store';
import type { LocalBackground } from './local-background';

export class ModeAwareBackground {
  private unsubscribe: (() => void) | null = null;
  private transition: Promise<void> = Promise.resolve();

  constructor(
    private readonly settings: DeviceSettingsStore,
    private readonly background: LocalBackground,
    private readonly logger: Logger,
  ) {}

  async start(): Promise<void> {
    this.unsubscribe ??= this.settings.onChange((settings: DeviceSettings) => {
      void this.apply(settings.mode);
    });
    await this.apply((await this.settings.get()).mode);
  }

  async stop(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.enqueue(() => this.background.shutdown());
  }

  private apply(mode: AppMode | null): Promise<void> {
    return this.enqueue(async () => {
      if (mode === 'local') {
        await this.background.start();
        return;
      }
      await this.background.shutdown();
    }).catch((error: unknown) => {
      this.logger.error('Failed to switch background work for app mode', { mode, error });
    });
  }

  private enqueue(step: () => Promise<void>): Promise<void> {
    this.transition = this.transition.then(step, step);
    return this.transition;
  }
}
