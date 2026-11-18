import type { ContextMenuRequest } from '@relay/shared';
import { create } from 'zustand';

export interface PendingContextMenu {
  readonly key: number;
  readonly request: ContextMenuRequest;
  readonly resolve: (id: string | null) => void;
}

interface ContextMenuState {
  readonly pending: PendingContextMenu | null;
}

export const useContextMenuStore = create<ContextMenuState>(() => ({ pending: null }));

let opened = 0;

export const settleContextMenu = (id: string | null): void => {
  const { pending } = useContextMenuStore.getState();
  if (pending === null) {
    return;
  }
  useContextMenuStore.setState({ pending: null });
  pending.resolve(id);
};

export const openContextMenu = (request: ContextMenuRequest): Promise<string | null> =>
  new Promise((resolve) => {
    settleContextMenu(null);
    opened += 1;
    useContextMenuStore.setState({ pending: { key: opened, request, resolve } });
  });

export const resetContextMenu = (): void => {
  settleContextMenu(null);
};
