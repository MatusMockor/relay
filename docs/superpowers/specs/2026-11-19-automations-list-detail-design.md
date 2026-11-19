# Automatizácie: zoznam, detail a šablóny

## Prečo

Dnešná sekcia Nastavenia > Automatizácie zobrazuje každé pravidlo ako stále rozbalený editor (veta z tokenov, AI inštrukcie, model, "Použiť na existujúce"). Pri viacerých pravidlách je to stena, tokeny nevyzerajú klikateľne, AI nastavenia sa ukazujú aj pri pravidlách bez AI a nové pravidlo začína prázdne. Cieľ: aby bolo na prvý pohľad jasné, čo ktoré pravidlo robí, a aby sa pravidlo dalo vytvoriť a upraviť bez hľadania skrytých popoverov.

Schválená maketa: zoznam -> detail -> nové pravidlo zo šablóny.

## Ciele

- **Zoznam**: jeden riadok na pravidlo - úchyt na ťahanie, názov (+ odznak "Predvolené", odznak "Cieľ neexistuje" pri rozbitej akcii), čitateľné zhrnutie `podmienky -> akcie`, čip účtu (alebo "Všetky účty"), prepínač zapnutia, šípka. Vypnuté pravidlo je stlmené. Klik na riadok otvorí detail. Tlačidlo "+ Nové pravidlo" v hlavičke.
- **Poradie**: ťahaním riadkov sa mení `order` (runner vyhodnocuje pravidlá podľa `order`). Klávesová alternatíva pre presun vyššie/nižšie.
- **Detail** (v tom istom paneli, "‹ Automatizácie" späť):
  - hlavička: upraviteľný názov, odznak Predvolené, prepínač
  - blok **Kedy**: výber účtu (select), podmienky ako riadky formulára (typ + hodnota, "a zároveň" medzi nimi), "+ Pridať podmienku", odstránenie riadka
  - blok **Čo spraviť**: akcie ako zaškrtávacie riadky v mriežke; AI akcie majú odznak "AI"; "Presunúť do priečinka/štítka" a "Pridať štítok" majú výber cieľa
  - blok **AI**: inštrukcie + model, zobrazí sa len keď je zvolená akcia, ktorá AI používa (`summary`, `task`)
  - pätička: "Použiť na maily, ktoré už mám" (existujúce ApplyToExisting) a "Odstrániť pravidlo"
- **Nové pravidlo**: výber šablóny (Úlohy z Jiry, Upratať newslettre, Dôležitý odosielateľ, Faktúry s prílohou, Prázdne pravidlo). Šablóna predvyplní podmienky a akcie, potom sa otvorí detail. Šablóny, ktoré potrebujú hodnotu (doména, adresa), otvoria detail s prázdnym poľom na doplnenie.
- "Obnoviť predvolené Jira pravidlo" zostáva dostupné.

## Mimo rozsahu

- Žiadna zmena dátového modelu, API, engine ani IPC. Čisto renderer (`apps/desktop/src/renderer`).
- Zoradenie mailových účtov (samostatná úloha).
- OR podmienky - engine podporuje len AND.

## Obmedzenia

- Ukladanie zostáva automatické cez `useAutomationEditor` / `useReplaceAutomations` ako dnes; bez tlačidla Uložiť. Pravidlo bez podmienky ani nevalidná podmienka sa neuloží (zachovať hint).
- Zachovať dnešné pravidlá: zmena účtu zahodí parametrizované akcie (`scopeChange`); move/label akcia pri "Všetky účty" najprv vyžiada účet; viac `addLabel` akcií je povolených, `moveTo` len jedna; aspoň jedna akcia.
- Pravidlá repa: súbory < 150 riadkov, žiadne `else`, žiadne komentáre, žiadne `any`, slovenské texty s diakritikou, len spojovník (žiadne pomlčky "—"/"–").
- Bez drag & drop knižnice - natívne HTML5 drag and drop.

## Prístupy

1. **Zoznam + detail + šablóny (zvolené)** - rieši všetky štyri problémy, najväčšia zmena UI.
2. Zbalené karty s rovnakou vetou z tokenov - menšia zmena, ale princíp tokenov a popoverov zostáva.
3. Sprievodca po krokoch - jednoduchý pre nové pravidlo, pomalý pri úprave, zoznam sa nezlepší.

## Na builderovi

- Rozdelenie komponentov a súborov, CSS v `styles/automations.css`.
- Ktoré existujúce komponenty (ConditionForm, ActionMenu, pickery, TokenPopover, OptionList) znovu použiť a ktoré odstrániť.
- Presné texty zhrnutí v zozname (vychádzať z `describeCondition` / `describeAction`).
- Prepísanie testov v `apps/desktop/src/renderer/test/automation*.test.tsx` na nové UI pri zachovaní pokrytia správania.
