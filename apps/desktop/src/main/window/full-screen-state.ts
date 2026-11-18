import type { FullScreenStatus } from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';

export interface FullScreenWindow {
  isFullScreen(): boolean;
  on(event: 'enter-full-screen' | 'leave-full-screen', listener: () => void): unknown;
}

export class FullScreenState {
  readonly changes = new EventHub<FullScreenStatus>();
  private current: FullScreenStatus = { fullScreen: false };

  status(): FullScreenStatus {
    return this.current;
  }

  track(window: FullScreenWindow): void {
    this.set(window.isFullScreen());
    window.on('enter-full-screen', () => {
      this.set(true);
    });
    window.on('leave-full-screen', () => {
      this.set(false);
    });
  }

  private set(fullScreen: boolean): void {
    if (this.current.fullScreen === fullScreen) {
      return;
    }
    this.current = { fullScreen };
    this.changes.publish(this.current);
  }
}
