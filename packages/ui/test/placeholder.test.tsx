import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Placeholder } from '../src';

describe('Placeholder', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders an accessible landmark with title, description and children', () => {
    render(
      <Placeholder title="Relay" description="Pripravujeme schránku" className="extra">
        <button type="button">Pokračovať</button>
      </Placeholder>,
    );
    const region = screen.getByRole('region', { name: 'Relay' });
    expect(region.className).toBe('relay-placeholder extra');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Relay');
    expect(screen.getByText('Pripravujeme schránku')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pokračovať' })).toBeDefined();
  });

  it('omits the description paragraph when none is given', () => {
    const { container } = render(<Placeholder title="Relay" />);
    expect(container.querySelector('p')).toBeNull();
  });
});
