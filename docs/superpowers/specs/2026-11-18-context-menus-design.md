# Kontextové menu pre priečinky a konverzácie

## Zámer

Pravý klik na priečinok v bočnom paneli a na konverzáciu v zozname otvorí natívne kontextové menu ako v macOS Mail, aby sa bežné akcie (hlavne "označiť všetko ako prečítané") dali spraviť bez klávesových skratiek a bez otvárania konverzácie.

## Ciele

- Priečinok v bočnom paneli (Doručená pošta, Úlohy, Pripomenuté, Hotovo, Odoslané, Kôš, štítky): položka "Označiť všetko ako prečítané".
- Riadok konverzácie v zozname: "Označiť ako prečítané" / "Označiť ako neprečítané" (podľa stavu), "Hotovo" (v Hotovo "Vrátiť do Doručenej pošty", v Koši "Obnoviť"), "Pripomenúť…", oddeľovač, "Presunúť do koša" (v Koši skryté).
- Funguje v lokálnom aj synchronizovanom režime.

## Non-goals

- Štítky v menu (výslovne vynechané).
- Menu na Konceptoch a Naplánovaných (nemajú stav prečítania), na riadkoch konceptov a naplánovaných správ, na tabuľkách splitov.
- Viacnásobný výber konverzácií.

## Anti-goals

- "Označiť všetko ako prečítané" nesmie zasiahnuť len načítanú stránku zoznamu.
- Žiadne vlastné HTML menu, ktoré sa tvári ako natívne.

## Prístupy

- **A) Natívne Electron menu (zvolené).** Renderer pošle cez IPC zoznam položiek, main ho zobrazí cez `Menu.popup()` a vráti id zvolenej položky alebo `null`. Systémový vzhľad a správanie zadarmo, cena je jeden IPC kanál.
- B) Vlastné React menu nad `Popover` z `@relay/ui`. Plne testovateľné v rendereri a s kbd hintami, ale nevyzerá ako macOS. Zamietnuté, používateľ chce správanie ako macOS Mail.
- Pre hromadné označenie: slučka v rendereri nad načítanými riadkami zamietnutá (neúplné, N volaní). Jediná rozumná cesta je engine use case nad celým priečinkom.

## Doplnené po prieskume main (PR #60)

- Main už má Popover menu na pravý klik pre IMAP priečinky a Gmail štítky (`features/folders/edit/FolderMenu.tsx`: Nový podpriečinok, Premenovať, Presunúť do…, Zmazať). Rozhodnutie používateľa: **natívne všade**. Toto menu sa prerobí na natívne a dostane navrchu "Označiť všetko ako prečítané".
- Renderer beží aj v prehliadači (`BrowserPlatform`, používajú ho aj renderer testy). Tam sa to isté menu (rovnaký zoznam položiek) vykreslí cez `Popover` ako záloha.
- Menu priečinka dostanú aj IMAP priečinky (`mailbox`) a Spam. Menu konverzácie v Spame: Nie je spam, Presunúť do koša. V Odoslaných: len prečítané/neprečítané a Presunúť do koša.

## Návrh

1. **IPC `context-menu`** (`packages/shared/src/ipc`): request-response kanál so zod schémou položiek (`id`, `label`, `enabled`, `type: 'normal' | 'separator'`), odpoveď `{ id: string } | null`. Main proces (`apps/desktop/src/main/native`) postaví `Menu` z položiek a zavolá `popup` pre okno odosielateľa; resolve pri kliku alebo pri zatvorení menu (`callback`). Renderer volá cez abstrakciu (port), aby sa v testoch dala nahradiť.
2. **Riadok konverzácie:** `onContextMenu` na `ListRow` najprv vyberie riadok (ako macOS Mail), potom zobrazí menu a zvolené id namapuje na existujúce `useThreadCommands` (`markDone`, `trash`, nový `markUnread` / `markRead` toggle) a na existujúci `WhenPicker` pre "Pripomenúť…" ukotvený pri riadku. Toasty s undo ostávajú ako pri skratkách.
3. **Priečinok:** `onContextMenu` na tlačidlách vo `FolderNav` zobrazí menu s jednou položkou "Označiť všetko ako prečítané".
4. **Engine use case `markFolderRead`:** vstup = priečinok (`view`, `labelId`) a scope účtu, prejde všetky neprečítané konverzácie priečinka (nie len prvú stránku), označí ich správy ako `seen` cez existujúci `FlagWriter` / provider ops outbox a vyšle `thread.upserted`. Vráti počet zmenených konverzácií.
5. **Napojenie v oboch režimoch:** lokálny kanál do `LocalEngine`, nový endpoint v `packages/shared/src/api/endpoints/threads.ts` a server controller, nová metóda na `MailClient` (local aj remote implementácia). Po dokončení invalidovať zoznamy vlákien.
6. **Spätná väzba:** toast "Označené ako prečítané: N" alebo "Všetko je už prečítané" pri 0.

## Nechané na implementátora

- Ako engine prechádza priečinok (stránkovanie `queryFolder` alebo nová metóda portu na neprečítané id) a či zápisy flagov zoskupí do jednej transakcie. Podmienka: nesmie robiť N samostatných IMAP spojení, provider ops idú cez existujúci outbox.
- Presný tvar a názvy IPC kanála a endpointu podľa existujúcich konvencií.
- Či "Pripomenúť…" otvorí `WhenPicker` cez existujúci `ReminderHost`.
