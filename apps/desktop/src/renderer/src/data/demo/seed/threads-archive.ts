import type { DemoThread } from './types';

export const ARCHIVE_THREADS: readonly DemoThread[] = [
  {
    id: 'ar-dph-09',
    acct: 'fl',
    from: 'mo',
    state: 'done',
    labels: ['inv'],
    subj: 'DPH 09/2025',
    msgs: [
      [
        'mo',
        [-404, 9, 12],
        'Dobrý deň,\n\nv prílohe posielam DPH za 9. mesiac. Priznanie podám do 25. 10.\n\nMária Hollá',
      ],
    ],
  },
  {
    id: 'ar-dph-08',
    acct: 'fl',
    from: 'mo',
    state: 'done',
    labels: ['inv'],
    subj: 'DPH 08/2025',
    msgs: [
      [
        'mo',
        [-435, 10, 40],
        'Dobrý deň,\n\nDPH je potrebné zaplatiť do 25. 9. Výpočet nájdete v prílohe.\n\nMária Hollá',
      ],
    ],
  },
  {
    id: 'ar-zmluva',
    acct: 'fl',
    from: 'lb',
    state: 'done',
    subj: 'Rámcová zmluva 2025',
    msgs: [
      [
        'lb',
        [-512, 14, 5],
        'Ahoj,\n\nposielam podpísanú rámcovú zmluvu na rok 2025. Faktúry prosím vždy do 10. dňa v mesiaci.\n\nLenka',
      ],
    ],
  },
  {
    id: 'ar-release',
    acct: 'efa',
    from: 'mh',
    state: 'done',
    subj: 'Release 3.2 a migrácia platobnej brány',
    msgs: [
      [
        'mh',
        [-380, 16, 30],
        'Ahoj,\n\nrelease 3.2 pôjde v piatok. Migrácia platobnej brány je hotová, retry logiku doladíme neskôr.\n\nMartin',
      ],
    ],
  },
];
