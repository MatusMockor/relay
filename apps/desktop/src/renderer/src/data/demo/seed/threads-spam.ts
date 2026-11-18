import type { DemoThread } from './types';

export const SPAM_THREADS: readonly DemoThread[] = [
  {
    id: 'x-lottery',
    acct: 'os',
    from: 'vy',
    state: 'spam',
    unread: true,
    subj: 'Gratulujeme, vyhrali ste nový telefón',
    msgs: [
      [
        'vy',
        [0, 6, 12],
        'Stačí potvrdiť adresu a zaplatiť poštovné 1,99 €. Ponuka platí len 24 hodín.',
      ],
    ],
  },
  {
    id: 'x-crypto',
    acct: 'efa',
    from: 'kr',
    state: 'spam',
    subj: 'Zarobte 5 000 € týždenne bez rizika',
    msgs: [['kr', [-1, 22, 40], 'Naša AI obchoduje za vás. Registrácia je zadarmo.']],
  },
];
