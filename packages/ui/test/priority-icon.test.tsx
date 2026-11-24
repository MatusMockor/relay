import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PriorityIcon } from '../src';

afterEach(() => {
  cleanup();
});

const filledBars = (container: HTMLElement): number =>
  container.querySelectorAll('.prio-bar.on').length;

describe('PriorityIcon', () => {
  it('fills three, two and one ascending bars for high, medium and low', () => {
    const high = render(<PriorityIcon priority="high" />).container;
    const medium = render(<PriorityIcon priority="medium" />).container;
    const low = render(<PriorityIcon priority="low" />).container;

    expect([filledBars(high), filledBars(medium), filledBars(low)]).toEqual([3, 2, 1]);
    expect(low.querySelectorAll('.prio-bar')).toHaveLength(3);
  });

  it('draws the urgent square and the none dash and names the icon when labelled', () => {
    const { container } = render(<PriorityIcon priority="urgent" label="Priorita: Urgentná" />);
    const none = render(<PriorityIcon priority="none" />).container;

    expect(container.querySelector('.prio-box')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Priorita: Urgentná' })).toBeDefined();
    expect(none.querySelector('.prio-dash')).not.toBeNull();
    expect(none.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
