// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useRowDrag } from '../src/features/settings/automations/use-row-drag';

const dragData = () => ({
  dataTransfer: {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: () => undefined,
    setDragImage: () => undefined,
  },
});

function Rows({
  keys,
  moves,
}: {
  readonly keys: readonly string[];
  readonly moves: [number, number][];
}) {
  const drag = useRowDrag({
    keys,
    disabled: false,
    onMove: (from, to) => {
      moves.push([from, to]);
    },
  });
  return (
    <ul>
      {keys.map((key, index) => (
        <li key={key} aria-label={key} {...drag.target(index)}>
          <button type="button" aria-label={`Presunúť ${key}`} {...drag.handle(index)} />
        </li>
      ))}
    </ul>
  );
}

describe('row drag', () => {
  afterEach(() => {
    cleanup();
  });

  it('moves the dragged row from its current index when the list reorders during the drag', () => {
    const moves: [number, number][] = [];
    const view = render(<Rows keys={['a', 'b', 'c']} moves={moves} />);
    act(() => {
      fireEvent.dragStart(screen.getByRole('button', { name: 'Presunúť a' }), dragData());
    });

    view.rerender(<Rows keys={['b', 'a', 'c']} moves={moves} />);
    act(() => {
      fireEvent.drop(screen.getByRole('listitem', { name: 'c' }), dragData());
    });

    expect(moves).toEqual([[1, 2]]);
  });

  it('ignores a drop when the dragged row disappeared', () => {
    const moves: [number, number][] = [];
    const view = render(<Rows keys={['a', 'b', 'c']} moves={moves} />);
    act(() => {
      fireEvent.dragStart(screen.getByRole('button', { name: 'Presunúť a' }), dragData());
    });

    view.rerender(<Rows keys={['b', 'c']} moves={moves} />);
    act(() => {
      fireEvent.drop(screen.getByRole('listitem', { name: 'c' }), dragData());
    });

    expect(moves).toEqual([]);
  });
});
