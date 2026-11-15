import type { DemoThread } from './types';

export const PERSONAL_THREADS: readonly DemoThread[] = [
  {
    id: 'os-chata',
    acct: 'os',
    from: 'ob',
    unread: true,
    subj: 'Chata v Terchovej tento víkend',
    ai: 'Pýta sa, či ideš v sobotu na chatu, odpoveď chce do piatka',
    sum: 'Ondrej organizuje v sobotu chatu v Terchovej. Chce vedieť do piatka, či ideš, aby mohol potvrdiť počet ľudí.',
    list: ['Odpovedať Ondrejovi do piatka'],
    msgs: [
      [
        'ob',
        [0, 8, 47],
        'Čau,\n\nv sobotu ideme na chatu do Terchovej, vraciame sa v nedeľu poobede. Ideš? Potrebujem to vedieť do piatka, nech potvrdím chatu.\n\nOndro',
      ],
    ],
    sugs: [
      ['Idem', 'Čau Ondro, idem, rátaj so mnou.'],
      ['Len na sobotu', 'Čau, v nedeľu mám obed u mamy, prídem len na sobotu.'],
      ['Tentokrát nie', 'Čau Ondro, tentokrát nemôžem, užite si to.'],
    ],
  },
  {
    id: 'os-dar',
    acct: 'os',
    from: 'kt',
    unread: true,
    labels: ['fam'],
    subj: 'Darček pre ocka',
    ai: 'Navrhuje zložiť sa na hodinky, odpoveď chce do piatka',
    sum: 'Ocko má o dva týždne 60. narodeniny. Katka navrhuje zložiť sa na hodinky po 90 € a objednať ich do piatka, aby prišli včas.',
    list: ['Odpovedať Katke do piatka', 'Poslať jej 90 €'],
    msgs: [
      [
        'kt',
        [-1, 20, 10],
        'Ahoj, ocko má o dva týždne šesťdesiatku. Nezložíme sa na niečo väčšie?',
      ],
      [
        'kt',
        [0, 7, 15],
        'Našla som pekné hodinky, vyšlo by to po 90 € na osobu. Ak súhlasíš, objednám ich do piatka.\n\nKatka',
      ],
    ],
    sugs: [
      ['Súhlasím', 'Ahoj Katka, super nápad, súhlasím. Pošlem ti 90 € ešte dnes.'],
      ['Pozriem večer', 'Ahoj, pozriem si ich večer a ozvem sa.'],
    ],
  },
  {
    id: 'os-obed',
    acct: 'os',
    from: 'mm',
    unread: true,
    labels: ['fam'],
    subj: 'Nedeľný obed',
    ai: 'Pozýva na nedeľný obed o 12:30, príde aj Katka',
    sum: 'Mama pozýva v nedeľu o 12:30 na obed. Robí sviečkovú, príde aj Katka s Tomim. Chce vedieť, či prídeš, aby navarila dosť.',
    msgs: [
      [
        'mm',
        [0, 6, 52],
        'Ahoj zlatko,\n\nprídeš v nedeľu na obed? Robím sviečkovú, príde aj Katka s Tomim. Okolo 12:30.\n\nDaj vedieť, nech navarím dosť.\n\nMama',
      ],
    ],
    sugs: [
      ['Prídem', 'Ahoj mami, prídem, teším sa.'],
      ['Prídem neskôr', 'Ahoj mami, v nedeľu sa vraciam z chaty, prídem okolo druhej.'],
    ],
  },
  {
    id: 'os-voda',
    acct: 'os',
    from: 'sp',
    subj: 'Odpočet vodomerov do 25. 11.',
    ai: 'Treba nahlásiť stav vodomerov do stredy 25. 11.',
    sum: 'Správca bytového domu zbiera stavy vodomerov. Treba nahlásiť studenú aj teplú vodu do stredy 25. 11., stačí fotka alebo odpoveď na mail.',
    list: ['Odfotiť vodomery', 'Poslať stav správcovi'],
    msgs: [
      [
        'sp',
        [-1, 16, 5],
        'Dobrý deň,\n\nprosím nahláste stav vodomerov studenej a teplej vody do stredy 25. 11. Stačí odpovedať na tento e-mail alebo poslať fotku.\n\nS pozdravom, Rastislav Horný, správca',
      ],
    ],
  },
  {
    id: 'os-obj',
    acct: 'os',
    from: 'nk',
    split: 'other',
    unread: true,
    labels: ['shop'],
    subj: 'Objednávka 48211 je na ceste',
    ai: 'Kávovar príde v piatok medzi 10:00 a 14:00',
    msgs: [
      [
        'nk',
        [-1, 18, 40],
        'Dobrý deň,\n\nvaša objednávka 48211 (pákový kávovar a 2 balenia kávy) bola odovzdaná kuriérovi.\n\nDoručenie očakávame v piatok medzi 10:00 a 14:00.\n\nTím Nakupko.sk',
      ],
    ],
  },
  {
    id: 'os-banka',
    acct: 'os',
    from: 'db',
    split: 'other',
    subj: 'Výpis z účtu za október',
    msgs: [
      [
        'db',
        [0, 6, 0],
        'Dobrý deň, výpis z bežného účtu za október je pripravený v internetbankingu.',
      ],
    ],
  },
  {
    id: 'fl-ponuka',
    acct: 'fl',
    from: 'jl',
    split: 'clients',
    unread: true,
    labels: ['cli'],
    subj: 'Cenová ponuka: nový web kaviarne',
    ai: 'Chce ponuku na web s menu a rezerváciami do pondelka',
    sum: 'Juraj Lukáč otvára v januári druhú pobočku Kaviarne Zrnko a chce nový web: menu, rezervácie stolov a malý e-shop so zrnkovou kávou. Ponuku potrebuje do pondelka, rozpočet má približne 3 000 €.',
    list: ['Pripraviť rozpis prác a cenu', 'Poslať ponuku do pondelka'],
    msgs: [
      [
        'jl',
        [0, 9, 5],
        'Dobrý deň,\n\nv januári otvárame druhú pobočku a potrebovali by sme nový web. Hlavne menu, rezervácie stolov a malý e-shop so zrnkovou kávou.\n\nViete mi poslať cenovú ponuku do pondelka? Rozpočet máme približne 3 000 €.\n\nJuraj Lukáč, Kaviareň Zrnko',
      ],
    ],
    sugs: [
      ['Pošlem do pondelka', 'Dobrý deň, ďakujem za dôveru. Ponuku vám pošlem do pondelka.'],
      [
        'Najprv krátky call',
        'Dobrý deň, pred ponukou by som rád prebral detaily na krátkom hovore. Hodí sa vám zajtra o 10:00?',
      ],
    ],
  },
  {
    id: 'fl-stretko',
    acct: 'fl',
    from: 'lb',
    split: 'clients',
    unread: true,
    labels: ['cli'],
    subj: 'Stretnutie k redizajnu v utorok?',
    ai: 'Navrhuje utorok 16:00 v ateliéri, chce potvrdenie',
    sum: 'Lenka Brezinová chce prejsť druhú verziu homepage a rozpočet na ďalšiu fázu. Navrhuje utorok o 16:00 u nich v ateliéri.',
    list: ['Potvrdiť termín Lenke', 'Prejsť komentáre vo Figme'],
    msgs: [
      [
        'lb',
        [0, 8, 20],
        'Ahoj,\n\nvďaka za druhú verziu homepage, vo Figme som ti nechala pár komentárov. Mohli by sme sa stretnúť v utorok o 16:00 u nás v ateliéri? Prejdeme aj rozpočet na ďalšiu fázu.\n\nLenka',
      ],
    ],
    sugs: [
      ['Utorok sedí', 'Ahoj Lenka, utorok o 16:00 mi sedí, prídem.'],
      ['Iný termín', 'Ahoj Lenka, v utorok nemôžem, hodí sa ti streda o 15:00?'],
    ],
  },
  {
    id: 'fl-figma',
    acct: 'fl',
    from: 'fg',
    split: 'other',
    unread: true,
    subj: 'Lenka Brezinová komentovala Homepage v2',
    msgs: [
      [
        'fg',
        [0, 8, 14],
        'Lenka Brezinová pridala 3 komentáre do súboru Ateliér Brezina, Homepage v2.\n\n„Hero je super, len by som skúsila väčší nadpis a menej textu.“',
      ],
    ],
  },
  {
    id: 'fl-faktura',
    acct: 'fl',
    from: 'fk',
    unread: true,
    labels: ['inv'],
    subj: 'Faktúra FA-2026-011 je 7 dní po splatnosti',
    ai: 'Ateliér Brezina ešte nezaplatil 1 450 €',
    msgs: [
      [
        'fk',
        [0, 7, 0],
        'Faktúra FA-2026-011 pre Ateliér Brezina s. r. o. je 7 dní po splatnosti.\n\nSuma 1 450,00 €, splatnosť 12. 11. 2026.',
      ],
    ],
  },
  {
    id: 'fl-dph',
    acct: 'fl',
    from: 'mo',
    labels: ['inv'],
    subj: 'Podklady k DPH za október',
    ai: 'Chce vydané a prijaté faktúry za október do 25. 11.',
    sum: 'Účtovníčka Mária Hollá pripravuje priznanie k DPH za október. Do stredy 25. 11. potrebuje všetky vydané a prijaté faktúry a výpis z podnikateľského účtu.',
    list: ['Exportovať vydané faktúry z Faktúrky', 'Pridať prijaté faktúry a výpis z účtu'],
    msgs: [
      [
        'mo',
        [-1, 14, 30],
        'Dobrý deň,\n\npošlite mi prosím do stredy 25. 11. všetky vydané a prijaté faktúry za október a výpis z podnikateľského účtu. Potrebujem to na priznanie k DPH.\n\nĎakujem, Mária Hollá',
      ],
    ],
  },
];
