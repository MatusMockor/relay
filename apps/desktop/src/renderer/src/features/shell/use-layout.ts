import { useEffect, useState } from 'react';
import { useUiStore } from '../../state/ui-store';

export const LIMITS = {
  sidebar: { min: 180, max: 360, initial: 214, cut: 120 },
  rightPanel: { min: 260, max: 520, initial: 300, cut: 200 },
} as const;
export const MIN_MIDDLE = 420;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const autoBreakpoint = (sidebar: number, rightPanel: number, rightOpen: boolean): number =>
  Math.max(
    1180,
    clamp(sidebar, LIMITS.sidebar.min, LIMITS.sidebar.max) +
      (rightOpen ? clamp(rightPanel, LIMITS.rightPanel.min, LIMITS.rightPanel.max) : 0) +
      MIN_MIDDLE,
  );

export interface LayoutModel {
  readonly leftVisible: boolean;
  readonly sidebar: number;
  readonly rightPanel: number;
}

const useViewportWidth = (): number => {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return width;
};

export const useLayout = (): LayoutModel => {
  const viewport = useViewportWidth();
  const { leftUser, rightOpen, widths } = useUiStore();
  const leftVisible =
    leftUser ?? viewport >= autoBreakpoint(widths.sidebar, widths.rightPanel, rightOpen);
  let sidebar = leftVisible ? clamp(widths.sidebar, LIMITS.sidebar.min, LIMITS.sidebar.max) : 0;
  let rightPanel = rightOpen
    ? clamp(widths.rightPanel, LIMITS.rightPanel.min, LIMITS.rightPanel.max)
    : 0;
  let over = sidebar + rightPanel + MIN_MIDDLE - viewport;
  if (over > 0 && rightPanel > 0) {
    const cut = Math.min(over, rightPanel - LIMITS.rightPanel.min);
    rightPanel -= cut;
    over -= cut;
  }
  if (over > 0 && sidebar > 0) {
    sidebar -= Math.min(over, sidebar - LIMITS.sidebar.min);
  }
  return { leftVisible, sidebar, rightPanel };
};
