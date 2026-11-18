import type { DemoThread } from './types';

export const WORK_THREADS: readonly DemoThread[] = [
  {
    id: 'c-mr412',
    acct: 'efa',
    from: 'mh',
    unread: true,
    labels: ['efa'],
    subj: 'Code review: refaktor platobnej brány',
    ai: 'Review MR !412 potrebné ešte dnes',
    sum: 'Martin čaká na tvoje review MR !412 (refaktor PaymentGateway, hlavne retry a idempotency). Potrebuje ho do dnes, ide do piatkového release spolu s WEB-482.',
    list: ['Pozrieť MR !412 (retry logika, idempotency kľúče)', 'Odpovedať Martinovi do konca dňa'],
    msgs: [
      [
        'mh',
        [-1, 16, 20],
        'Ahoj,\n\nhodil som MR !412 s refaktorom PaymentGateway. Pozrieš sa na to do štvrtka? Je tam hlavne retry logika a idempotency kľúče.\n\nMartin',
      ],
      ['me-efa', [-1, 16, 45], 'Pozriem zajtra dopoludnia.'],
      [
        'mh',
        [0, 8, 40],
        'Ahoj, pripomínam sa. Ide to do piatkového release spolu s WEB-482, takže by bolo fajn to mať dnes.\n\nNajviac ma zaujíma, či ti dáva zmysel, ako som spravil retry s idempotency kľúčom.\n\nVďaka, Martin',
      ],
    ],
    sugs: [
      [
        'Pozriem do obeda',
        'Ahoj Martin, pozriem to do obeda a hneď ti napíšem. Retry s idempotency kľúčom si prejdem ako prvé.',
      ],
      [
        'Pozrel som, mám pripomienku',
        'Ahoj Martin, pozrel som MR !412. Retry s backoffom je super. Jedna pripomienka: idempotency kľúč by som generoval pred validáciou, inak môžu dva rýchle requesty prejsť oba. Inak môžeš mergnúť.',
      ],
      [
        'Dnes to nestihnem',
        'Ahoj Martin, dnes to bohužiaľ nestihnem, mám rozrobený API-77. Vieš to dať pozrieť Petrovi? Ak nie, pozriem zajtra ráno ako prvé.',
      ],
    ],
  },
  {
    id: 'c-web482',
    acct: 'efa',
    from: 'pn',
    key: 'WEB-482',
    unread: true,
    labels: ['jira', 'efa'],
    subj: 'Filtrovanie objednávok v API',
    ai: '/orders vracia aj zmazané objednávky, bug či zámer?',
    sum: 'Peter v komentári na WEB-482 zistil, že /orders?status=all vracia aj soft-deleted objednávky a frontend ich zobrazuje. Chce vedieť, či je to zámer, ešte pred piatkovým release.',
    list: ['Overiť scope withTrashed v OrderRepository', 'Odpovedať Petrovi v Jire'],
    task: { title: 'Filtrovanie objednávok v API', what: 'čaká na teba', state: 'waiting' },
    msgs: [
      ['mh', [-3, 14, 10], 'Martin zmenil stav z Rozpracované na Na kontrole'],
      [
        'pn',
        [0, 8, 31],
        'Peter pridal komentár:\n\nKeď volám /orders?status=all, vracia to aj soft-deleted objednávky a frontend ich potom ukazuje v zozname. Je to zámer? Potrebujeme to vedieť pred piatkovým release.',
      ],
    ],
    sugs: [
      [
        'Nie, je to bug',
        'Ahoj Peter, nie, zmazané objednávky by tam byť nemali. Je to bug v scope, opravím to dnes a dám ti vedieť vo WEB-482.',
      ],
      [
        'Áno, zámerne',
        'Ahoj Peter, áno, status=all vracia zámerne aj zmazané kvôli adminu. Pre frontend použi status=active, to ich vynechá.',
      ],
      ['Pozriem a ozvem sa', 'Ahoj Peter, pozriem sa na to dopoludnia a ozvem sa ti do obeda.'],
    ],
  },
  {
    id: 'c-stage',
    acct: 'efa',
    from: 'lh',
    unread: true,
    labels: ['efa'],
    subj: 'Prístupy na stage pre nového kolegu',
    sum: 'Samuel Varga nastupuje v pondelok do frontend tímu. Lucia potrebuje do piatka jeho účet na stage a členstvo v GitLab skupine frontend.',
    list: [
      'Vytvoriť účet samuel.varga na stage',
      'Pridať ho do GitLab skupiny frontend',
      'Potvrdiť Lucii',
    ],
    msgs: [
      [
        'lh',
        [0, 8, 12],
        'Ahoj,\n\nod pondelka k nám nastupuje Samuel Varga do frontend tímu. Vieš mu prosím do piatka vytvoriť účet na stage a pridať ho do GitLab skupiny frontend?\n\nJeho e-mail bude samuel.varga@firma.sk.\n\nĎakujem, Lucia',
      ],
    ],
    sugs: [
      [
        'Spravím do piatka',
        'Ahoj Lucia, jasné, účet na stage aj GitLab skupinu Samuelovi spravím do piatka a dám ti vedieť.',
      ],
      [
        'Už je to hotové',
        'Ahoj Lucia, Samuel už má účet na stage aj prístup do skupiny frontend. Prihlasovacie údaje mu prídu e-mailom.',
      ],
      [
        'Presmerujem na DevOps',
        'Ahoj Lucia, prístupy na stage teraz rieši Michal z DevOps, preposielam mu to.',
      ],
    ],
  },
  {
    id: 'c-lunch',
    acct: 'efa',
    from: 'tb',
    subj: 'Obed v piatok?',
    sum: 'Tomáš sa pýta, či ideš v piatok o 12:00 na obed do nového bistra na Obchodnej. Ak áno, rezervuje stôl pre štyroch.',
    msgs: [
      [
        'tb',
        [0, 7, 58],
        'Ahoj, ideme v piatok na obed do nového bistra na Obchodnej? Vraj majú dobré polievky.\n\nAk áno, rezervujem stôl na 12:00 pre štyroch.\n\nT.',
      ],
    ],
    sugs: [
      ['Idem', 'Ahoj Tomáš, idem, rezervuj aj pre mňa.'],
      ['Dám vedieť zajtra', 'Ahoj, ešte neviem, v piatok máme release. Dám ti vedieť zajtra ráno.'],
      ['Tentokrát nie', 'Ahoj, tentokrát vynechám, v piatok je release. Nabudúce určite.'],
    ],
  },
  {
    id: 'c-api77',
    acct: 'efa',
    from: 'tb',
    key: 'API-77',
    unread: true,
    labels: ['jira', 'efa'],
    subj: 'Rate limit pre verejné API partnerov',
    ai: 'Partneri dostávajú 429, riešenie ešte dnes',
    sum: 'Partneri dostávajú na produkcii 429, lebo rate limit 600 za minútu je spoločný pre všetkých. Tomáš zvýšil prioritu na Highest a hľadá niekoho, kto to dnes vyrieši.',
    list: [
      'Dočasne zvýšiť limit pre partnerské kľúče',
      'Navrhnúť limit per API kľúč',
      'Dať Tomášovi odhad',
    ],
    task: { title: 'Rate limit pre partner API', what: 'čaká na teba', state: 'waiting' },
    msgs: [
      [
        'mk',
        [0, 7, 22],
        'Michal pridal komentár:\n\nV logoch vidím 429 od 6:50, hlavne partner Lux knihy. Limit je 600 requestov za minútu spoločne pre všetkých partnerov.',
      ],
      [
        'tb',
        [0, 7, 40],
        'Tomáš zmenil prioritu: High → Highest\n\nPartner volal, potrebujeme to vyriešiť ešte dnes. Kto si to vie zobrať?',
      ],
    ],
    sugs: [
      [
        'Beriem si to',
        'Ahoj Tomáš, API-77 si beriem. Do hodiny dočasne zvýšim limit pre partnerov a poobede pošlem návrh limitu per API kľúč.',
      ],
      [
        'Dočasne zvýšim limit',
        'Ahoj, ako rýchle riešenie zdvihnem limit pre partnerské kľúče na 2000 za minútu. Systémové riešenie odhadujem na 2 MD.',
      ],
      [
        'Potrebujem viac info',
        'Ahoj Tomáš, pozriem sa na to. Vieš mi prosím poslať, ktorí partneri sa sťažujú a od kedy?',
      ],
    ],
  },
  {
    id: 'c-retro',
    acct: 'efa',
    from: 'jk',
    labels: ['efa'],
    subj: 'Pozvánka: Retro šprintu 46',
    sum: 'Retro šprintu 46 bude v pondelok o 10:00 v zasadačke Dunaj. Jana chce od každého dve-tri veci, ktoré fungovali, a jednu na zlepšenie.',
    list: ['Pripraviť 2-3 body na retro'],
    msgs: [
      [
        'jk',
        [-1, 11, 3],
        'Ahoj všetci,\n\nretro šprintu 46 bude v pondelok o 10:00 v zasadačke Dunaj. Prineste dve-tri veci, ktoré fungovali, a jednu, ktorú by ste zmenili.\n\nJana',
      ],
    ],
    sugs: [
      ['Prídem', 'Ahoj Jana, budem tam. Vďaka za pozvánku.'],
      [
        'Pošlem body vopred',
        'Ahoj Jana, prídem a body ti pošlem už v piatok, nech ich máš pripravené.',
      ],
      ['Nestihnem', 'Ahoj Jana, v pondelok o 10:00 mám kolíziu. Body ti pošlem písomne, dobre?'],
    ],
  },
  {
    id: 'c-q1',
    acct: 'efa',
    from: 'mh',
    labels: ['efa'],
    subj: 'Plánovanie Q1: odhady pre Partner API',
    sum: 'Na budúci týždeň sa plánuje Q1. Martin chce do piatka hrubé odhady v MD pre tri časti Partner API.',
    list: [
      'Odhad: webhooky (API-80)',
      'Odhad: rate limit per kľúč (API-77)',
      'Odhad: OAuth dokumentácia (API-74)',
    ],
    msgs: [
      [
        'mh',
        [-1, 15, 2],
        'Ahoj,\n\nna budúci týždeň plánujeme Q1. Pošli mi prosím do piatka hrubé odhady pre Partner API (webhooky, rate limit per kľúč, OAuth dokumentácia), stačí v MD.\n\nMartin',
      ],
    ],
    sugs: [
      ['Pošlem v piatok', 'Ahoj Martin, odhady ti pošlem v piatok dopoludnia.'],
      [
        'Hrubé odhady',
        'Ahoj Martin, hrubo: webhooky 5 MD, rate limit per kľúč 2 MD, OAuth dokumentácia 1 MD. V piatok to ešte spresním.',
      ],
    ],
  },
];
