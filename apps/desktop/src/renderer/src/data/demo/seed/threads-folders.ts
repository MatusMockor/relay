import type { DemoThread } from './types';

export const FOLDER_THREADS: readonly DemoThread[] = [
  {
    id: 'f-alfa-kickoff',
    acct: 'efa',
    folder: 'alfa',
    from: 'tb',
    state: 'done',
    subj: 'Alfa: zápis z úvodného stretnutia',
    msgs: [
      [
        'tb',
        [-6, 15, 20],
        'Ahojte,\n\nposielam zápis z úvodného stretnutia k projektu Alfa. Termín prvej verzie je koniec mesiaca.\n\nTomáš',
      ],
    ],
  },
  {
    id: 'f-beta-review',
    acct: 'efa',
    folder: 'beta',
    from: 'mh',
    unread: true,
    state: 'done',
    subj: 'Beta: návrh architektúry na pripomienkovanie',
    msgs: [
      [
        'mh',
        [-1, 11, 5],
        'Ahoj,\n\nv prílohe je návrh architektúry pre Betu. Pozri si prosím časť o fronte úloh do štvrtka.\n\nMartin',
      ],
    ],
  },
  {
    id: 'f-faktura-okt',
    acct: 'efa',
    folder: 'faktury',
    from: 'fk',
    state: 'done',
    subj: 'Faktúra 2026/0142 za október',
    msgs: [
      [
        'fk',
        [-12, 9, 0],
        'Dobrý deň,\n\nv prílohe posielame faktúru za október. Splatnosť je 14 dní.',
      ],
    ],
  },
  {
    id: 'f-zrnko-menu',
    acct: 'efa',
    folder: 'zrnko',
    from: 'jl',
    state: 'done',
    subj: 'Nové menu na web',
    msgs: [
      [
        'jl',
        [-4, 16, 40],
        'Ahoj,\n\nposielam nové menu, prosím vymeň ho na webe do piatka.\n\nJuraj',
      ],
    ],
  },
  {
    id: 'f-brezina-katalog',
    acct: 'fl',
    folder: 'brezina',
    from: 'lb',
    unread: true,
    state: 'done',
    subj: 'Katalóg na jar, finálne podklady',
    msgs: [
      [
        'lb',
        [0, 9, 30],
        'Ahoj,\n\nfinálne podklady ku katalógu sú na zdieľanom disku. Daj vedieť, či ti niečo chýba.\n\nLenka',
      ],
    ],
  },
  {
    id: 'g-acme-zmluva',
    acct: 'os',
    from: 'ob',
    state: 'done',
    labels: ['acme'],
    subj: 'Acme: podpísaná zmluva',
    msgs: [['ob', [-3, 13, 15], 'Čau,\n\nzmluva s Acme je podpísaná, posielam sken.\n\nOndro']],
  },
  {
    id: 'g-taliansko',
    acct: 'os',
    from: 'kt',
    labels: ['trip', 'trip-it'],
    subj: 'Letenky do Ríma',
    msgs: [
      [
        'kt',
        [0, 6, 50],
        'Ahoj,\n\nnašla som letenky do Ríma na máj, kúpime ich ešte tento týždeň?\n\nKatka',
      ],
    ],
  },
];
