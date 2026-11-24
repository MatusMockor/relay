import type { Platform } from '../platform/Platform';
import type { ThemeController } from './theme-controller';
import { themeHint } from './theme-hint';

export const bootTheme = (
  controller: ThemeController,
  search: string,
  platform: Platform,
): void => {
  const hint = themeHint(search);
  if (hint !== null) {
    controller.preview(hint);
  }
  void controller.hydrate(() => platform.deviceSettings().then((settings) => settings.theme));
};
