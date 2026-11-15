import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Overlay, Popover, ResizeHandle, resetLayers } from '../src';

afterEach(() => {
  cleanup();
  resetLayers();
  vi.unstubAllGlobals();
});

const ANCHOR = { left: 100, right: 160, top: 500, bottom: 530 };

describe('Layer order', () => {
  it('closes a popover mounted together with its parent overlay first', () => {
    const closed: string[] = [];
    render(
      <Overlay
        onClose={() => {
          closed.push('overlay');
        }}
      >
        <Popover
          anchor={ANCHOR}
          label="Výber"
          onClose={() => {
            closed.push('popover');
          }}
        >
          obsah
        </Popover>
      </Overlay>,
    );

    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(closed).toEqual(['popover']);
  });

  it('sends keys to an overlay opened after a nested popover', () => {
    const closed: string[] = [];
    const parent = (
      <Overlay onClose={() => closed.push('sheet')}>
        <Popover anchor={ANCHOR} label="Výber" onClose={() => closed.push('popover')}>
          obsah
        </Popover>
      </Overlay>
    );
    const { rerender } = render(<>{parent}</>);

    rerender(
      <>
        {parent}
        <Overlay onClose={() => closed.push('palette')}>paleta</Overlay>
      </>,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(closed).toEqual(['palette']);
  });
});

describe('Popover placement', () => {
  it('flips above the anchor when its content grows after the first layout', () => {
    const observers: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observers.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    window.innerHeight = 800;
    render(
      <Popover anchor={ANCHOR} label="Výber" onClose={() => undefined}>
        obsah
      </Popover>,
    );
    const pop = document.querySelector<HTMLElement>('.pop');
    expect(pop?.style.top).toBe('536px');

    Object.defineProperty(pop, 'offsetHeight', { configurable: true, value: 300 });
    act(() => {
      observers.forEach((notify) => {
        notify();
      });
    });

    expect(pop?.style.top).toBe('194px');
  });
});

describe('ResizeHandle drag cleanup', () => {
  it('removes the drag class from the body when unmounted mid-drag', () => {
    vi.stubGlobal(
      'PointerEvent',
      class extends MouseEvent {
        readonly pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 0;
        }
      },
    );
    const { container, unmount } = render(
      <ResizeHandle
        edge="left"
        label="Šírka zoznamu"
        controls="list"
        width={300}
        limits={{ min: 200, max: 500, initial: 300, cut: 120 }}
        onResize={() => undefined}
        onCollapse={() => undefined}
        onCommit={() => undefined}
      />,
    );
    const handle = container.querySelector<HTMLElement>('.rz');
    expect(handle).not.toBeNull();
    if (handle === null) {
      return;
    }
    handle.setPointerCapture = () => undefined;

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10 });
    expect(document.body.classList.contains('rz-drag')).toBe(true);
    unmount();

    expect(document.body.classList.contains('rz-drag')).toBe(false);
  });
});
