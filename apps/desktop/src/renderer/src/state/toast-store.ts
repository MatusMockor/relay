import { create } from 'zustand';

export interface ToastEntry {
  readonly id: number;
  readonly message: string;
  readonly undo: boolean;
}

interface UndoEntry {
  readonly run: () => void;
  readonly until: number;
}

interface ToastState {
  readonly toast: ToastEntry | null;
}

export const useToastStore = create<ToastState>(() => ({ toast: null }));

const undoStack: UndoEntry[] = [];
let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export interface ToastOptions {
  readonly undo?: () => void;
  readonly ms?: number;
  readonly undoMs?: number;
}

export const showToast = (message: string, options: ToastOptions = {}): void => {
  sequence += 1;
  const ms = options.ms ?? (options.undo === undefined ? 3_000 : 5_000);
  if (options.undo !== undefined) {
    undoStack.push({ run: options.undo, until: Date.now() + (options.undoMs ?? 60 * 60_000) });
  }
  useToastStore.setState({ toast: { id: sequence, message, undo: options.undo !== undefined } });
  if (timer !== null) {
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    useToastStore.setState({ toast: null });
  }, ms);
};

export const undoLast = (): void => {
  const entry = undoStack.pop();
  if (entry === undefined) {
    showToast('Nie je čo vrátiť');
    return;
  }
  if (Date.now() > entry.until) {
    showToast('Už sa nedá vrátiť');
    return;
  }
  entry.run();
  showToast('Vrátené');
};

export const resetToasts = (): void => {
  undoStack.length = 0;
  useToastStore.setState({ toast: null });
};
