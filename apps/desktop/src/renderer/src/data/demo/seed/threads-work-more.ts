import type { DemoThread } from './types';

export const WORK_THREADS_MORE: readonly DemoThread[] = [
  {
    id: 'c-cms217',
    acct: 'efa',
    from: 'jk',
    key: 'CMS-217',
    split: 'jira',
    labels: ['jira'],
    subj: 'Priradené tebe',
    ai: 'Nový bug: editor stráca obrázky po uložení',
    sum: 'Jana ti priradila bug od klienta Denník Juh. Editor po uložení konceptu stratí vložené obrázky, repro kroky sú v popise.',
    list: ['Zreprodukovať podľa krokov', 'Skontrolovať ukladanie príloh v DraftService'],
    task: {
      title: 'Editor stráca obrázky po uložení',
      what: 'nové',
      state: 'open',
      priority: 'urgent',
    },
    msgs: [
      [
        'jk',
        [-4, 11, 5],
        'Jana ti priradila úlohu:\n\nEditor stráca obrázky po uložení konceptu. Repro: vložiť 2 obrázky, uložiť koncept, znovu otvoriť. Nahlásil to klient Denník Juh.',
      ],
    ],
  },
  {
    id: 'j-web479',
    acct: 'efa',
    from: 'es',
    key: 'WEB-479',
    split: 'jira',
    unread: true,
    labels: ['jira'],
    subj: 'Stav: In QA → Reopened',
    ai: 'Vrátené z QA: zlá diakritika v CSV exporte',
    sum: 'Eva vrátila WEB-479 z QA: CSV export otvorený v Exceli zobrazuje diakritiku ako otázniky. Pravdepodobne chýba UTF-8 BOM.',
    list: ['Pridať BOM na začiatok CSV', 'Otestovať v Exceli a Numbers', 'Vrátiť Eve do QA'],
    task: {
      title: 'Export CSV: zlé kódovanie diakritiky',
      what: 'vrátené z QA',
      state: 'waiting',
      priority: 'low',
    },
    msgs: [
      [
        'es',
        [0, 8, 5],
        'Eva zmenila stav: In QA → Reopened\n\nPo otvorení v Exceli sú namiesto č a ž otázniky. Asi chýba BOM v UTF-8.',
      ],
    ],
    sugs: [
      ['Pridám BOM', 'Ahoj Eva, vďaka. Pridám UTF-8 BOM a dnes ti to vrátim do QA.'],
      [
        'Pošli mi súbor',
        'Ahoj Eva, vieš mi prosím poslať aj samotný CSV súbor? Chcem overiť kódovanie.',
      ],
    ],
  },
  {
    id: 'j-api74',
    acct: 'efa',
    from: 'mh',
    key: 'API-74',
    split: 'jira',
    labels: ['jira'],
    subj: 'Stav zmenený na Na kontrole',
    msgs: [
      [
        'mh',
        [0, 8, 2],
        'Martin zmenil stav z Rozpracované na Na kontrole\n\nDokumentácia OAuth pre partnerov',
      ],
    ],
  },
  {
    id: 'o-pipeline',
    acct: 'efa',
    from: 'gl',
    split: 'other',
    unread: true,
    subj: 'Pipeline zlyhala: main #2291',
    ai: 'Pipeline #2291 padá na OrderExportTest po MR !409',
    msgs: [
      [
        'gl',
        [0, 9, 12],
        'Pipeline #2291 pre vetvu main zlyhala.\n\nJob test:unit zlyhal po 3 min 12 s.\nZlyhaný test: OrderExportTest::testCsvEncoding\nSpustil Peter Novák (merge !409).',
      ],
    ],
  },
  {
    id: 'o-mr-merged',
    acct: 'efa',
    from: 'gl',
    split: 'other',
    state: 'done',
    subj: 'Merge request !409 bol zlúčený',
    msgs: [
      [
        'gl',
        [0, 7, 40],
        'Merge request !409 Export objednávok do CSV bol zlúčený do vetvy main.\n\nZlúčil Peter Novák.',
      ],
    ],
  },
  {
    id: 'o-sentry',
    acct: 'efa',
    from: 'se',
    split: 'other',
    unread: true,
    subj: 'Regresia: PaymentTimeoutException',
    msgs: [
      [
        'se',
        [0, 8, 55],
        'Regresia: PaymentTimeoutException\n\ncheckout-service, production. 48 udalostí za poslednú hodinu, 19 používateľov.\nChyba bola označená ako vyriešená v release 2.13.2.',
      ],
    ],
  },
  {
    id: 'o-newsletter',
    acct: 'efa',
    from: 'nl',
    split: 'other',
    unread: true,
    subj: 'Č. 212: CSS anchor positioning v praxi',
    ai: 'Anchor positioning, View Transitions a tipy na rýchlejší build',
    msgs: [
      [
        'nl',
        [-1, 7, 0],
        'Ahoj, tento týždeň sa pozrieme na CSS anchor positioning v praxi, nové View Transitions a päť tipov, ako zrýchliť build.',
      ],
    ],
    html: '<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px"><img src="https://frontend-tyzdennik.sk/banner-212.png" alt="Frontend týždenník" width="560" height="120"><h2 style="color:#1d2a5b">Č. 212: CSS anchor positioning v praxi</h2><p>Ahoj,</p><p>tento týždeň sa pozrieme na <b>CSS anchor positioning</b> v praxi, nové <i>View Transitions</i> medzi stránkami a päť tipov, ako zrýchliť build vo veľkých projektoch.</p><p><a href="https://frontend-tyzdennik.sk/212">Čítať celé číslo</a></p><p style="color:#888;font-size:12px">Príjemné čítanie, redakcia</p></div>',
  },
  {
    id: 'z-release',
    acct: 'efa',
    from: 'lh',
    state: 'reminder',
    remindAt: [0, 14, 0],
    labels: ['efa'],
    subj: 'Release checklist 2.15',
    sum: 'Lucia pripravila checklist pre release 2.15. Do piatka chce od teba potvrdiť, ktoré úlohy z Partner API idú do release.',
    list: ['Prejsť checklist 2.15', 'Potvrdiť Lucii WEB-482 a API-77'],
    msgs: [
      [
        'lh',
        [-1, 10, 20],
        'Ahoj,\n\nposielam checklist pre release 2.15. Prejdi prosím do piatka časť Partner API a potvrď mi, čo z toho ide von.\n\nLucia',
      ],
    ],
  },
  {
    id: 'd-loadtest',
    acct: 'efa',
    from: 'mk',
    state: 'done',
    markedDone: true,
    subj: 'Load test vo štvrtok večer',
    msgs: [
      [
        'mk',
        [-1, 11, 20],
        'Ahoj,\n\nload test checkoutu spustím vo štvrtok o 20:00, výsledky budú ráno v Grafane. Ak chcete pridať scenár, napíšte mi do stredy.\n\nMichal',
      ],
    ],
  },
  {
    id: 's-onboard',
    acct: 'efa',
    from: 'lh',
    state: 'done',
    subj: 'Re: Onboarding checklist',
    msgs: [
      ['lh', [-2, 10, 0], 'Ahoj, doplníš prosím do onboarding checklistu prístupy pre vývojárov?'],
      [
        'me-efa',
        [-1, 14, 5],
        'Ahoj Lucia, checklist som doplnil o prístupy do GitLabu, Sentry a stage. Pozri prosím, či ti to takto sedí.',
        { cc: ['mk'], bcc: ['mh'] },
      ],
    ],
  },
  {
    id: 'x-promo',
    acct: 'efa',
    from: 'ev',
    split: 'other',
    state: 'trash',
    subj: 'Posledné lístky na BA Dev Days',
    msgs: [['ev', [-4, 9, 0], 'Early bird končí v piatok. Zaregistruj sa ešte dnes.']],
  },
];
