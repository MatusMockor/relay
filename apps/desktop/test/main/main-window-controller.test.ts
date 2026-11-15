import { describe, expect, it } from 'vitest';
import {
  type ManagedWindow,
  MainWindowController,
} from '../../src/main/bootstrap/main-window-controller';

class TestWindow implements ManagedWindow {
  readonly calls: string[] = [];
  private closedListeners: (() => void)[] = [];
  private destroyed = false;

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isMinimized(): boolean {
    return false;
  }

  restore(): void {
    this.calls.push('restore');
  }

  show(): void {
    this.calls.push('show');
  }

  focus(): void {
    this.calls.push('focus');
  }

  on(_event: 'closed', listener: () => void): this {
    this.closedListeners.push(listener);
    return this;
  }

  close(): void {
    this.destroyed = true;
    this.closedListeners.forEach((listener) => {
      listener();
    });
  }
}

describe('MainWindowController', () => {
  it('creates the window again after a failed attempt', async () => {
    const results: (TestWindow | Error)[] = [
      new TestWindow(),
      new Error('renderer failed to load'),
      new TestWindow(),
    ];
    let created = 0;
    const controller = new MainWindowController(() => {
      const next = results[created] ?? new Error('no more windows');
      created += 1;
      return next instanceof TestWindow ? Promise.resolve(next) : Promise.reject(next);
    });

    const first = await controller.open();
    expect(first).toBe(results[0]);
    first.close();
    await expect(controller.focus()).rejects.toThrow('renderer failed to load');
    await controller.focus();

    expect(created).toBe(3);
    const recreated = results[2];
    expect(recreated instanceof TestWindow ? recreated.calls : []).toEqual(['show', 'focus']);
  });
});
