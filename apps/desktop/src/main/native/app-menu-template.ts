import type { MenuItemConstructorOptions } from 'electron';

export interface AppMenuOptions {
  readonly platform: NodeJS.Platform;
  readonly appName: string;
  readonly isDevelopment: boolean;
  readonly onCheckForUpdates: () => void;
}

export const CHECK_FOR_UPDATES_ID = 'check-for-updates';

const checkForUpdatesItem = (onCheck: () => void): MenuItemConstructorOptions => ({
  id: CHECK_FOR_UPDATES_ID,
  label: 'Skontrolovať aktualizácie…',
  click: () => {
    onCheck();
  },
});

const editMenu = (platform: NodeJS.Platform): MenuItemConstructorOptions => ({
  label: 'Upraviť',
  submenu: [
    { role: 'undo', label: 'Späť' },
    { role: 'redo', label: 'Znova' },
    { type: 'separator' },
    { role: 'cut', label: 'Vystrihnúť' },
    { role: 'copy', label: 'Kopírovať' },
    { role: 'paste', label: 'Prilepiť' },
    ...(platform === 'darwin'
      ? [{ role: 'pasteAndMatchStyle', label: 'Prilepiť bez formátovania' } as const]
      : []),
    { role: 'delete', label: 'Odstrániť' },
    { role: 'selectAll', label: 'Vybrať všetko' },
  ],
});

const viewMenu = (isDevelopment: boolean): MenuItemConstructorOptions => ({
  label: 'Zobraziť',
  submenu: [
    ...(isDevelopment
      ? ([
          { role: 'reload', label: 'Obnoviť' },
          { role: 'toggleDevTools', label: 'Vývojárske nástroje' },
          { type: 'separator' },
        ] as const)
      : []),
    { role: 'resetZoom', label: 'Skutočná veľkosť' },
    { role: 'zoomIn', label: 'Priblížiť' },
    { role: 'zoomOut', label: 'Oddialiť' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Celá obrazovka' },
  ],
});

const macAppMenu = (appName: string, onCheck: () => void): MenuItemConstructorOptions => ({
  label: appName,
  submenu: [
    { role: 'about', label: `O aplikácii ${appName}` },
    checkForUpdatesItem(onCheck),
    { type: 'separator' },
    { role: 'services', label: 'Služby' },
    { type: 'separator' },
    { role: 'hide', label: `Skryť ${appName}` },
    { role: 'hideOthers', label: 'Skryť ostatné' },
    { role: 'unhide', label: 'Zobraziť všetko' },
    { type: 'separator' },
    { role: 'quit', label: `Ukončiť ${appName}` },
  ],
});

const windowMenu = (platform: NodeJS.Platform): MenuItemConstructorOptions => ({
  role: 'window',
  label: 'Okno',
  submenu: [
    { role: 'minimize', label: 'Minimalizovať' },
    { role: 'zoom', label: 'Zväčšiť' },
    ...(platform === 'darwin'
      ? ([{ type: 'separator' }, { role: 'front', label: 'Všetko dopredu' }] as const)
      : ([{ role: 'close', label: 'Zavrieť' }] as const)),
  ],
});

export const buildAppMenuTemplate = (options: AppMenuOptions): MenuItemConstructorOptions[] => {
  const common = [
    editMenu(options.platform),
    viewMenu(options.isDevelopment),
    windowMenu(options.platform),
  ];
  if (options.platform === 'darwin') {
    return [
      macAppMenu(options.appName, options.onCheckForUpdates),
      { label: 'Súbor', submenu: [{ role: 'close', label: 'Zavrieť okno' }] },
      ...common,
    ];
  }
  return [
    {
      label: 'Súbor',
      submenu: [
        checkForUpdatesItem(options.onCheckForUpdates),
        { type: 'separator' },
        { role: 'quit', label: 'Ukončiť' },
      ],
    },
    ...common,
  ];
};
