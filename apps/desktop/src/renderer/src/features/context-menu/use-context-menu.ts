import type { ContextMenuItem } from '@relay/shared';
import { type MouseEvent, useCallback } from 'react';
import { useAppContext } from '../../data/hooks/services-context';

export type ShowContextMenu = (
  event: MouseEvent,
  items: readonly ContextMenuItem[],
) => Promise<string | null>;

export const useContextMenu = (): ShowContextMenu => {
  const { platform } = useAppContext();
  return useCallback(
    (event, items) => {
      event.preventDefault();
      return platform.showContextMenu({
        items: [...items],
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
      });
    },
    [platform],
  );
};
