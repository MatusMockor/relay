import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IconButton, TOOLTIP_DELAY, TooltipButton } from '../src';
import { tooltipPosition } from '../src/components/tooltip/tooltip-position';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const renderSpam = () => {
  render(
    <TooltipButton tip="Nahlásiť spam" shortcut={['!']} aria-label="Nahlásiť spam">
      !
    </TooltipButton>,
  );
  return screen.getByRole('button', { name: 'Nahlásiť spam' });
};

describe('TooltipButton', () => {
  it('shows the tooltip only after the hover delay and links it with aria-describedby', () => {
    const button = renderSpam();

    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY - 1);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.textContent).toBe('Nahlásiť spam !');
    expect(tooltip.querySelector('.kbd')?.textContent).toBe('!');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(button.getAttribute('title')).toBeNull();
  });

  it('does not show when the pointer leaves before the delay', () => {
    const button = renderSpam();

    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY * 2);
    });

    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides on mouse leave', () => {
    const button = renderSpam();
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY);
    });
    expect(screen.getByRole('tooltip')).toBeDefined();

    fireEvent.mouseLeave(button);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows immediately on keyboard focus and hides on Escape and blur', () => {
    const button = renderSpam();

    act(() => {
      button.focus();
    });
    expect(screen.getByRole('tooltip').textContent).toContain('Nahlásiť spam');

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => {
      button.blur();
      button.focus();
    });
    expect(screen.getByRole('tooltip')).toBeDefined();

    act(() => {
      button.blur();
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('hides when the button is pressed and keeps the caller handlers', () => {
    const calls: string[] = [];
    render(
      <TooltipButton
        tip="Hotovo"
        aria-label="Hotovo"
        onMouseEnter={() => calls.push('enter')}
        onMouseDown={() => calls.push('down')}
      />,
    );
    const button = screen.getByRole('button', { name: 'Hotovo' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY);
    });

    fireEvent.mouseDown(button);

    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(calls).toEqual(['enter', 'down']);
  });

  it('renders the tooltip outside the clipping toolbar', () => {
    render(
      <div data-testid="bar" style={{ overflow: 'hidden' }}>
        <IconButton label="Spýtať sa AI" shortcut={['A']} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Spýtať sa AI' });
    fireEvent.mouseEnter(button);
    act(() => {
      vi.advanceTimersByTime(TOOLTIP_DELAY);
    });

    const tooltip = screen.getByRole('tooltip');
    expect(screen.getByTestId('bar').contains(tooltip)).toBe(false);
    expect(tooltip.parentElement).toBe(document.body);
    expect(button.getAttribute('title')).toBeNull();
  });
});

describe('tooltipPosition', () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 120, height: 26 };

  it('centers below the anchor', () => {
    const position = tooltipPosition(
      { left: 300, right: 330, top: 10, bottom: 40 },
      'below',
      size,
      viewport,
    );

    expect(position).toEqual({ left: 255, top: 48, side: 'below', arrow: 60 });
  });

  it('clamps to the viewport edge and keeps the arrow on the anchor', () => {
    const position = tooltipPosition(
      { left: 770, right: 798, top: 10, bottom: 40 },
      'below',
      size,
      viewport,
    );

    expect(position.left).toBe(672);
    expect(position.arrow).toBe(110);
  });

  it('flips above when there is no room below', () => {
    const position = tooltipPosition(
      { left: 300, right: 330, top: 560, bottom: 590 },
      'below',
      size,
      viewport,
    );

    expect(position.side).toBe('above');
    expect(position.top).toBe(526);
  });
});
