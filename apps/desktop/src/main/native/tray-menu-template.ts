import type { MenuItemConstructorOptions, NativeImage } from 'electron';
import type { TrayAction, TrayMenuItem, TrayTone } from './tray-menu-items';
import type { TrayMenuFeatures } from './tray-menu-features';

export interface DotIcons {
  dot(color: string): NativeImage | string | undefined;
}

export interface TrayTemplateOptions {
  readonly features: TrayMenuFeatures;
  readonly icons: DotIcons;
  readonly dispatch: (action: TrayAction) => void;
}

export const TONE_COLORS: Readonly<Record<TrayTone, string>> = {
  ok: '#34c759',
  busy: '#ff9f0a',
  failed: '#ff3b30',
  idle: '#8e8e93',
};

type ItemOf<Kind extends TrayMenuItem['kind']> = Extract<TrayMenuItem, { kind: Kind }>;

const withIcon = (icon: NativeImage | string | undefined): MenuItemConstructorOptions =>
  icon === undefined ? {} : { icon };

const actionItem = (
  item: ItemOf<'action'>,
  options: TrayTemplateOptions,
): MenuItemConstructorOptions => ({
  label: item.label,
  click: () => {
    options.dispatch(item.action);
  },
  ...(item.accelerator === undefined
    ? {}
    : { accelerator: item.accelerator, registerAccelerator: false }),
});

const choiceLabels = (
  item: ItemOf<'choice'>,
  features: TrayMenuFeatures,
): MenuItemConstructorOptions => {
  if (item.sublabel === null) {
    return { label: item.label };
  }
  if (features.sublabels) {
    return { label: item.label, sublabel: item.sublabel };
  }
  return { label: `${item.label} (${item.sublabel})` };
};

const choiceItem = (
  item: ItemOf<'choice'>,
  options: TrayTemplateOptions,
): MenuItemConstructorOptions => ({
  type: 'radio',
  ...choiceLabels(item, options.features),
  checked: item.checked,
  ...withIcon(item.color === null ? undefined : options.icons.dot(item.color)),
  click: () => {
    options.dispatch(item.action);
  },
});

const headerItem = (
  item: ItemOf<'header'>,
  options: TrayTemplateOptions,
): MenuItemConstructorOptions => {
  if (options.features.headers) {
    return { type: 'header', label: item.label };
  }
  return { label: item.label, enabled: false };
};

const toTemplateItem = (
  item: TrayMenuItem,
  options: TrayTemplateOptions,
): MenuItemConstructorOptions => {
  if (item.kind === 'separator') {
    return { type: 'separator' };
  }
  if (item.kind === 'status') {
    return {
      label: item.label,
      enabled: false,
      ...withIcon(options.icons.dot(TONE_COLORS[item.tone])),
    };
  }
  if (item.kind === 'header') {
    return headerItem(item, options);
  }
  if (item.kind === 'note') {
    return { label: item.label, enabled: false };
  }
  if (item.kind === 'choice') {
    return choiceItem(item, options);
  }
  if (item.kind === 'submenu') {
    return { label: item.label, submenu: buildTrayTemplate(item.items, options) };
  }
  return actionItem(item, options);
};

export const buildTrayTemplate = (
  items: readonly TrayMenuItem[],
  options: TrayTemplateOptions,
): MenuItemConstructorOptions[] => items.map((item) => toTemplateItem(item, options));
