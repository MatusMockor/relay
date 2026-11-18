import { useEffect } from 'react';
import { z } from 'zod';
import { useAppContext } from '../../data/hooks/services-context';
import { type RightTab, setUi, useUiStore } from '../../state/ui-store';

const LAYOUT_KEY = 'relay.layout';
const TABS: readonly RightTab[] = ['contact', 'ai', 'calendar'];

interface StoredLayout {
  readonly leftUser: boolean | null;
  readonly rightOpen: boolean;
  readonly rightTab: RightTab;
  readonly collapsed: Readonly<Record<string, boolean>>;
}

const CollapsedSchema = z.record(z.string().max(1000), z.literal(true));

const collapsedOf = (value: unknown): Readonly<Record<string, boolean>> => {
  const parsed = CollapsedSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
};

const readLayout = (): Partial<StoredLayout> => {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(LAYOUT_KEY) ?? 'null');
    if (typeof raw !== 'object' || raw === null) {
      return {};
    }
    const value = raw as Record<string, unknown>;
    return {
      leftUser: typeof value.leftUser === 'boolean' ? value.leftUser : null,
      rightOpen: typeof value.rightOpen === 'boolean' ? value.rightOpen : true,
      rightTab: TABS.find((tab) => tab === value.rightTab) ?? 'contact',
      collapsed: collapsedOf(value.collapsed),
    };
  } catch {
    return {};
  }
};

const writeLayout = (layout: StoredLayout): void => {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    return;
  }
};

export const useLayoutPersistence = (): (() => void) => {
  const { platform } = useAppContext();
  useEffect(() => {
    setUi(readLayout());
    let active = true;
    const widthsAtRead = useUiStore.getState().widths;
    void platform.deviceSettings().then((settings) => {
      if (!active || useUiStore.getState().widths !== widthsAtRead) {
        return;
      }
      setUi({
        widths: {
          sidebar: settings.panelWidths.sidebar,
          rightPanel: settings.panelWidths.rightPanel,
        },
      });
    });
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      if (
        state.leftUser === previous.leftUser &&
        state.rightOpen === previous.rightOpen &&
        state.rightTab === previous.rightTab &&
        state.collapsed === previous.collapsed
      ) {
        return;
      }
      writeLayout({
        leftUser: state.leftUser,
        rightOpen: state.rightOpen,
        rightTab: state.rightTab,
        collapsed: state.collapsed,
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform]);
  return () => {
    const { widths } = useUiStore.getState();
    void platform.updateDeviceSettings({
      panelWidths: { sidebar: widths.sidebar, rightPanel: widths.rightPanel },
    });
  };
};
