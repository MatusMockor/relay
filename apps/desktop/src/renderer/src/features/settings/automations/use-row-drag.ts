import { type DragEvent, type KeyboardEvent, useState } from 'react';

export interface DragHandleProps {
  readonly draggable: boolean;
  readonly onDragStart: (event: DragEvent<HTMLElement>) => void;
  readonly onDragEnd: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

export interface DropTargetProps {
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLElement>) => void;
}

export interface RowDrag {
  readonly moved: string | null;
  place(index: number): 'above' | 'below' | null;
  handle(index: number): DragHandleProps;
  target(index: number): DropTargetProps;
}

export interface RowDragOptions {
  readonly keys: readonly string[];
  readonly disabled: boolean;
  readonly onMove: (from: number, to: number) => void;
}

const KEY_STEPS: Readonly<Record<string, number>> = { ArrowUp: -1, ArrowDown: 1 };

export const useRowDrag = ({ keys, disabled, onMove }: RowDragOptions): RowDrag => {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const sortable = (index: number) => !disabled && index < keys.length;
  const found = draggedKey === null ? -1 : keys.indexOf(draggedKey);
  const dragging = found < 0 ? null : found;
  const reset = () => {
    setDraggedKey(null);
    setOver(null);
  };
  return {
    moved,
    place: (index) => {
      if (dragging === null || over !== index || dragging === index) {
        return null;
      }
      return dragging < index ? 'below' : 'above';
    },
    handle: (index) => ({
      draggable: sortable(index),
      onDragStart: (event) => {
        if (!sortable(index)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', keys[index] ?? '');
        const row = event.currentTarget.closest('li');
        if (row !== null) {
          event.dataTransfer.setDragImage(row, 16, 16);
        }
        setMoved(null);
        setDraggedKey(keys[index] ?? null);
      },
      onDragEnd: reset,
      onKeyDown: (event) => {
        const step = KEY_STEPS[event.key];
        if (!event.altKey || step === undefined) {
          return;
        }
        event.preventDefault();
        if (!sortable(index)) {
          return;
        }
        setMoved(keys[index] ?? null);
        onMove(index, index + step);
      },
    }),
    target: (index) => ({
      onDragOver: (event) => {
        if (dragging === null || !sortable(index)) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(index);
      },
      onDrop: (event) => {
        event.preventDefault();
        if (dragging !== null && sortable(index)) {
          onMove(dragging, index);
        }
        reset();
      },
    }),
  };
};
