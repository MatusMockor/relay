import type { BrowserWindowConstructorOptions } from 'electron';

export type TitleBarOptions = Pick<
  BrowserWindowConstructorOptions,
  'titleBarStyle' | 'trafficLightPosition'
>;

const MAC_INSET_TITLE_BAR: TitleBarOptions = {
  titleBarStyle: 'hiddenInset',
  trafficLightPosition: { x: 16, y: 22 },
};

export const titleBarOptions = (platform: NodeJS.Platform): TitleBarOptions => {
  if (platform !== 'darwin') {
    return {};
  }
  return MAC_INSET_TITLE_BAR;
};
