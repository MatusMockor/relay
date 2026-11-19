import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openLayerCount, Overlay, Popover, ResizeHandle, resetLayers } from '../src';

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

  it('counts every open layer including nested popovers', () => {
    const { rerender, unmount } = render(<Overlay onClose={() => undefined}>nastavenia</Overlay>);
    expect(openLayerCount()).toBe(1);

    rerender(
      <Overlay onClose={() => undefined}>
        <Popover anchor={ANCHOR} label="Výber" onClose={() => undefined}>
          obsah
        </Popover>
      </Overlay>,
    );
    expect(openLayerCount()).toBe(2);

    unmount();
    expect(openLayerCount()).toBe(0);
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

describe('Popover preferred side', () => {
  it('opens above the anchor when asked and falls back below when there is no room', () => {
    window.innerHeight = 800;
    const { rerender } = render(
      <Popover anchor={ANCHOR} side="above" label="Výber" onClose={() => undefined}>
        obsah
      </Popover>,
    );
    const pop = document.querySelector<HTMLElement>('.pop');
    Object.defineProperty(pop, 'offsetHeight', { configurable: true, value: 200 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(pop?.style.top).toBe('294px');

    rerender(
      <Popover
        anchor={{ left: 100, right: 160, top: 40, bottom: 70 }}
        side="above"
        label="Výber"
        onClose={() => undefined}
      >
        obsah
      </Popover>,
    );

    expect(pop?.style.top).toBe('76px');
  });
});

describe('Popover on window resize', () => {
  const initialWidth = window.innerWidth;

  afterEach(() => {
    window.innerWidth = initialWidth;
  });

  it('moves back inside the viewport when the window gets narrower', () => {
    window.innerWidth = 1200;
    const anchor = { left: 900, right: 960, top: 100, bottom: 130 };
    render(
      <Popover anchor={anchor} label="Výber" onClose={() => undefined}>
        obsah
      </Popover>,
    );
    const pop = document.querySelector<HTMLElement>('.pop');
    expect(pop?.style.left).toBe('900px');

    act(() => {
      window.innerWidth = 1000;
      window.dispatchEvent(new Event('resize'));
    });

    expect(pop?.style.left).toBe('702px');
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
