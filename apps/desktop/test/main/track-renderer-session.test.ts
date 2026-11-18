import { describe, expect, it } from 'vitest';
import { RendererView } from '../../src/main/native/renderer-view';
import {
  type SessionHostWindow,
  trackRendererSession,
} from '../../src/main/native/track-renderer-session';

class HostWindow implements SessionHostWindow {
  private readonly listeners = new Map<string, () => void>();
  readonly webContents = {
    on: (event: string, listener: () => void) => this.listeners.set(event, listener),
  };

  on(event: string, listener: () => void): void {
    this.listeners.set(event, listener);
  }

  emit(event: string): void {
    this.listeners.get(event)?.();
  }
}

describe('trackRendererSession', () => {
  it.each(['closed', 'did-start-loading', 'render-process-gone'])(
    'ends the renderer session on %s',
    (event) => {
      const window = new HostWindow();
      const view = new RendererView();
      trackRendererSession(window, view);
      view.update({ session: 'server-a', scope: 'all', accounts: [] });
      window.emit(event);
      expect(view.session()).toBeNull();
    },
  );
});
