import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import type { TrayAction, TrayMenuItem } from '../../src/main/native/tray-menu-items';
import { trayMenuFeaturesOf } from '../../src/main/native/tray-menu-features';
import {
  buildTrayTemplate,
  TONE_COLORS,
  type TrayTemplateOptions,
} from '../../src/main/native/tray-menu-template';

const items: TrayMenuItem[] = [
  { kind: 'status', label: 'Synchronizácia zlyhala', tone: 'failed' },
  { kind: 'separator' },
  { kind: 'header', label: 'Otvoriť s účtom' },
  {
    kind: 'choice',
    label: 'Práca',
    sublabel: 'jana@firma.sk - 3',
    color: '#4f6ef7',
    checked: true,
    action: { type: 'select-scope', scope: 'all' },
  },
  { kind: 'note', label: 'Notifikácie pozastavené' },
  {
    kind: 'action',
    label: 'Ukončiť Relay',
    action: { type: 'quit' },
    accelerator: 'CmdOrCtrl+Q',
  },
  {
    kind: 'submenu',
    label: 'Pozastaviť notifikácie',
    items: [
      {
        kind: 'action',
        label: 'Na 1 hodinu',
        action: { type: 'pause-notifications', duration: 'hour' },
      },
    ],
  },
];

const setup = (platform: NodeJS.Platform, systemVersion: string) => {
  const dispatched: TrayAction[] = [];
  const options: TrayTemplateOptions = {
    features: trayMenuFeaturesOf(platform, systemVersion),
    icons: { dot: (color) => `dot:${color}` },
    dispatch: (action) => dispatched.push(action),
  };
  return { template: buildTrayTemplate(items, options), dispatched };
};

const press = (item: MenuItemConstructorOptions | undefined): void => {
  expect(item?.click).toBeTypeOf('function');
  if (item?.click === undefined) {
    return;
  }
  Reflect.apply(item.click, undefined, []);
};

describe('buildTrayTemplate', () => {
  it('renders native headers, sublabels and colored dots on a recent macOS', () => {
    const { template } = setup('darwin', '15.1.0');
    expect(template.slice(0, 5)).toEqual([
      { label: 'Synchronizácia zlyhala', enabled: false, icon: `dot:${TONE_COLORS.failed}` },
      { type: 'separator' },
      { type: 'header', label: 'Otvoriť s účtom' },
      expect.objectContaining({
        type: 'radio',
        label: 'Práca',
        sublabel: 'jana@firma.sk - 3',
        checked: true,
        icon: 'dot:#4f6ef7',
      }),
      { label: 'Notifikácie pozastavené', enabled: false },
    ]);
  });

  it('falls back to disabled headers and inline counts where macOS lacks them', () => {
    const { template } = setup('darwin', '13.6.1');
    expect(template[2]).toEqual({ label: 'Otvoriť s účtom', enabled: false });
    expect(template[3]).toMatchObject({ label: 'Práca (jana@firma.sk - 3)' });
    expect(template[3]).not.toHaveProperty('sublabel');
    expect(setup('darwin', '14.2').template[3]).not.toHaveProperty('sublabel');
    expect(setup('darwin', '14.4').template[3]).toHaveProperty('sublabel');
    expect(setup('linux', '6.8.0').template[2]).toEqual({
      label: 'Otvoriť s účtom',
      enabled: false,
    });
  });

  it('renders a choice without a sublabel as its plain label', () => {
    const template = buildTrayTemplate(
      [
        {
          kind: 'choice',
          label: 'Všetky účty',
          sublabel: null,
          color: null,
          checked: true,
          action: { type: 'select-scope', scope: 'all' },
        },
      ],
      {
        features: trayMenuFeaturesOf('darwin', '13.0'),
        icons: { dot: () => undefined },
        dispatch: () => undefined,
      },
    );
    expect(template[0]).toMatchObject({ type: 'radio', label: 'Všetky účty', checked: true });
    expect(template[0]).not.toHaveProperty('sublabel');
    expect(template[0]).not.toHaveProperty('icon');
  });

  it('shows shortcuts without registering them globally', () => {
    const { template } = setup('linux', '6.8.0');
    expect(template[5]).toMatchObject({
      label: 'Ukončiť Relay',
      accelerator: 'CmdOrCtrl+Q',
      registerAccelerator: false,
    });
  });

  it('dispatches the action of a clicked item, including nested ones', () => {
    const { template, dispatched } = setup('darwin', '15.1.0');
    press(template[3]);
    press(template[5]);
    const submenu = template[6]?.submenu;
    press(Array.isArray(submenu) ? submenu[0] : undefined);
    expect(dispatched).toEqual([
      { type: 'select-scope', scope: 'all' },
      { type: 'quit' },
      { type: 'pause-notifications', duration: 'hour' },
    ]);
  });
});
