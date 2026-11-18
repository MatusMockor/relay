# Kontextové menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Natívne kontextové menu na pravý klik pre priečinky (Označiť všetko ako prečítané + existujúce úpravy priečinkov) a pre konverzácie v zozname (prečítané/neprečítané, Hotovo, Pripomenúť…, Kôš).

**Architecture:** Jeden renderer port `Platform.showContextMenu(request)` so stratégiou podľa platformy: Electron pošle položky cez IPC `app.contextMenu.show` a main ich zobrazí cez `Menu.popup()`, prehliadač (a renderer testy) ich vykreslí cez `Popover`. Features stavajú zoznam položiek čistými funkciami a zvolené `id` mapujú na existujúce príkazy. Hromadné označenie je nový engine use case `FolderReadService`, napojený v lokálnom aj synchronizovanom režime.

**Tech Stack:** TypeScript strict, zod, Electron, React 19, TanStack Query, Zustand, NestJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-context-menus-design.md`

## Global Constraints

- Žiadne komentáre v kóde, žiadne `else`, žiadne `any`, súbor < 150 riadkov (max 300).
- Každý externý vstup (IPC, HTTP) validovaný zod schémou z `@relay/shared`.
- `engine` importuje len `shared`, žiadna Drizzle/SQL mimo repozitárov.
- UI copy slovensky s diakritikou, bez em/en dash. Presné texty: "Označiť všetko ako prečítané", "Označiť ako prečítané", "Označiť ako neprečítané", "Hotovo", "Vrátiť do Doručenej pošty", "Obnoviť", "Nie je spam", "Pripomenúť…", "Presunúť do koša", toasty "Označené ako prečítané: N" a "Všetko je už prečítané".
- Testy: integračné cez reálne kolaborátory, mock len Electron `Menu` (third-party boundary). Žiadne `throw` v testoch.
- Overenie: `pnpm lint`, `pnpm typecheck`, `pnpm test` (filtrované na balík). Žiadny build.
- Bez štítkov v menu konverzácie. Bez menu na riadkoch konceptov a naplánovaných správ, na Konceptoch, Naplánovaných a tabuľkách splitov.

## Review Focus

- Priečinok má viac neprečítaných konverzácií, než je jedna stránka: všetky musia byť označené (test v Task 1 s `pageSize: 2`).
- "Všetky účty" vs. jeden účet: označí len konverzácie vo vybranom scope (test v Task 1 a Task 5).
- Pravý klik na riadok konceptu: žiadne vlastné menu a ani potlačené systémové menu (test v Task 4).
- Menu zatvorené bez výberu (Esc / klik mimo) nič nespustí a promise sa vyrieši `null` (test v Task 3).
- Mirror na IMAP zlyhá: lokálne flagy ostanú `seen`, akcia nevyhodí chybu (správanie `ProviderMirror`, test v Task 1).

---

### Task 1: Engine use case `FolderReadService`

**Files:**

- Modify: `packages/shared/src/api/endpoints/threads.ts` (schémy + endpoint)
- Modify: `packages/engine/src/services/actions/handlers/flag-writer.ts` (vyčleniť stage)
- Create: `packages/engine/src/services/actions/folder-read-service.ts`
- Modify: `packages/engine/src/services/actions/create-message-actions-service.ts`, `packages/engine/src/create-engine-services.ts`, engine `index.ts` export
- Test: `packages/engine/test/services/folder-read.test.ts`

**Interfaces:**

- Produces (shared): `MarkFolderReadBodySchema` = `{ view: FolderView, accountId?: AccountId, splitId?: SplitId, labelId?: LabelId, mailboxId?: MailboxId }` s rovnakým `superRefine` ako `ThreadListQuerySchema` (mailbox/label vyžadujú id); `MarkFolderReadResponseSchema = z.object({ count: z.number().int().nonnegative() })`; endpoint `threadsEndpoints.markFolderRead`: `POST /threads/mark-read`, `auth: 'user'`.
- Produces (engine): `class FolderReadService { markAllRead(userId: UserId, folder: MarkFolderReadBody): Promise<MarkFolderReadResponse> }`, dostupná ako `EngineServices.folderRead`. Deps obsahujú `pageSize: number` (factory default 200).
- Produces: `FlagWriter.stage(repositories, context, targets, flag, value): Promise<{ thread: ThreadSummary; ops: PendingProviderOp[] }>` (beží vnútri unit of work); `write` ju používa.

- [ ] **Step 1: Write failing tests** v `folder-read.test.ts` (harness ako v `message-actions.test.ts`: `createTestEngine`, `seedAccount`, `deliverMail`, sync):
  - `marks every unread inbox thread and mirrors \Seen`: 3 neprečítané vlákna → `count === 3`, `inbox.list` nemá žiadne `unread`, správy na `FakeMailServer` majú `seen: true`, `engine.events` obsahuje 3× `thread.upserted`.
  - `covers more than one page`: služba s `pageSize: 2`, 5 neprečítaných → `count === 5`.
  - `respects the account scope`: dva účty, `accountId` prvého → druhý účet ostane neprečítaný.
  - `marks a mailbox folder` (`view: 'mailbox'`, `mailboxId`) a `marks a label`.
  - `returns zero and touches nothing when all read`: `count === 0`, žiadne nové provider ops.
  - `keeps local seen when the provider mirror fails`: fake server odmietne STORE → `count` sedí, lokálne `unread === false`, bez výnimky.
- [ ] **Step 2: Run** `pnpm --filter @relay/engine test folder-read` → FAIL (služba neexistuje).
- [ ] **Step 3: Implement.** Stránkuj cez `InboxQueryService.list` (validuje účet a split) s `limit: pageSize`, najprv zozbieraj všetky `unread` vlákna, potom pre každý účet jeden `unitOfWork.run`, v ňom pre každé vlákno `messages.listByThread` + `FlagWriter.stage` na neprečítané správy; po commite jeden `ProviderMirror.apply(account, allOps)` na účet; potom `thread.upserted` pre každé zmenené vlákno.
- [ ] **Step 4: Run** `pnpm --filter @relay/engine test` → PASS (vrátane `message-actions.test.ts`).
- [ ] **Step 5: Commit** `feat(engine): mark all threads in a folder as read`

### Task 2: Napojenie `markFolderRead` v oboch režimoch

**Files:**

- Modify: `packages/shared/src/ipc/local-channels.ts` (`'local.threads.markFolderRead': invokeChannel(MarkFolderReadBodySchema, MarkFolderReadResponseSchema)`)
- Modify: `apps/desktop/src/main/handlers/local/thread-handlers.ts` (+ `folderRead` v `ThreadServices`)
- Modify: `apps/server/src/threads/threads.controller.ts` (`@ApiRoute(api.threads.markFolderRead)`)
- Modify: `apps/desktop/src/renderer/src/data/MailClient.ts` (`ThreadReader.markFolderRead(folder: MarkFolderReadBody): Promise<MarkFolderReadResponse>`), `local/LocalMailClient.ts`, `remote/RemoteMailClient.ts`, `demo/DemoMailClient.ts` (+ demo helper v novom súbore `demo/demo-mark-read.ts`, ak by `DemoMailClient.ts` prekročil limit)
- Test: `apps/server/test/mail/mark-folder-read.e2e.test.ts`, `apps/desktop/test/main/local-mark-folder-read.e2e.test.ts`, `apps/desktop/src/renderer/test/demo-mail-client.test.ts`, `apps/desktop/src/renderer/test/remote-mail-client.test.ts`

**Interfaces:**

- Consumes: Task 1 schémy, endpoint a `EngineServices.folderRead`.
- Produces: `MailClient.markFolderRead(folder)` pre Task 5.

- [ ] **Step 1: Write failing tests:** server e2e `POST /threads/mark-read` s `{ view: 'inbox' }` → `{ count: N }` a vlákna sú prečítané, `{ view: 'label' }` bez `labelId` → 400; desktop main e2e cez IPC `local.threads.markFolderRead` (vzor `local-ipc.e2e.test.ts`); demo klient: po `markFolderRead({ view: 'inbox' })` žiadne `unread` v inboxe a vráti počet; remote klient volá správny endpoint.
- [ ] **Step 2: Run** filtrované testy → FAIL.
- [ ] **Step 3: Implement** handler, route, tri klientské implementácie.
- [ ] **Step 4: Run** `pnpm --filter @relay/server test mark-folder-read`, `pnpm --filter @relay/desktop test` → PASS.
- [ ] **Step 5: Commit** `feat: expose mark folder read in local and synced mode`

### Task 3: Kontextové menu infraštruktúra (natívne + Popover záloha)

**Files:**

- Create: `packages/shared/src/ipc/context-menu-channels.ts`, registrovať v `channels.ts`
- Create: `apps/desktop/src/main/native/context-menu.ts` (`ContextMenuFactory` port + Electron adaptér + `showContextMenu`)
- Create: `apps/desktop/src/main/handlers/context-menu-handlers.ts`, wiring v `apps/desktop/src/main/composition/compose-ipc.ts`
- Modify: `apps/desktop/src/renderer/src/platform/Platform.ts`, `ElectronPlatform.ts`, `BrowserPlatform.ts`
- Create: `apps/desktop/src/renderer/src/features/context-menu/context-menu-store.ts`, `ContextMenuHost.tsx` (Popover, markup a klávesy prevziať z dnešného `FolderMenu.tsx`: šípky/j/k, Enter, oddeľovač `.sepl`), `use-context-menu.ts`; `ContextMenuHost` vložiť tam, kde je dnes `FolderEditHost`
- Test: `apps/desktop/test/main/context-menu.test.ts`, `apps/desktop/src/renderer/test/context-menu.test.tsx`

**Interfaces:**

- Produces (shared): `ContextMenuItemSchema = z.discriminatedUnion('type', [z.object({ type: z.literal('item'), id: z.string().min(1).max(64), label: z.string().min(1).max(120), enabled: z.boolean() }), z.object({ type: z.literal('separator') })])`; `ContextMenuRequestSchema = z.object({ items: z.array(ContextMenuItemSchema).min(1).max(30), x: z.number().int(), y: z.number().int() })`; kanál `'app.contextMenu.show': invokeChannel(ContextMenuRequestSchema, z.object({ id: z.string().nullable() }))`.
- Produces (main): `showContextMenu(window: BrowserWindow, request: ContextMenuRequest, factory: ContextMenuFactory): Promise<string | null>`; resolve pri kliku na položku, `null` v `callback` po zatvorení bez výberu (resolve len raz).
- Produces (renderer): `Platform.showContextMenu(request: ContextMenuRequest): Promise<string | null>`; `useContextMenu(): (event: React.MouseEvent, items: readonly ContextMenuItem[]) => Promise<string | null>` (volá `preventDefault`, berie `clientX/clientY`).

- [ ] **Step 1: Write failing tests:** main: stub `ContextMenuFactory` zaznamená šablónu → labely, `enabled`, separator sedia, klik na položku → `'id'`, zatvorenie bez výberu → `null`, klik + následné zatvorenie → stále `'id'`; IPC odmietne prázdne `items`. Renderer (BrowserPlatform): otvorenie ukáže `role="menu"` s labelmi, klik → resolve `id`, `Escape` → `null`, neaktívna položka sa nedá zvoliť.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Browser stratégia: `showContextMenu` zapíše request + resolver do `context-menu-store`, `ContextMenuHost` ho vykreslí ako `Popover` ukotvený v bode a pri výbere/zatvorení zavolá resolver a store vyčistí. Nový request zatvorí predchádzajúci s `null`.
- [ ] **Step 4: Run** `pnpm --filter @relay/desktop test context-menu` a `pnpm --filter @relay/shared test` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): native context menu with popover fallback`

### Task 4: Menu konverzácie v zozname

**Files:**

- Create: `apps/desktop/src/renderer/src/features/list/thread-menu-items.ts`
- Create: `apps/desktop/src/renderer/src/features/list/use-thread-menu.ts`
- Modify: `apps/desktop/src/renderer/src/features/list/ListRow.tsx` (`onContextMenu` len pre `item.kind === 'thread'`)
- Modify: `apps/desktop/src/renderer/src/features/mail/use-thread-commands.ts` (+ `markUnread(thread)`), `features/shell/RowActions.tsx` (exportovať `actionView` na zdieľanie)
- Test: `apps/desktop/src/renderer/test/thread-context-menu.test.tsx`

**Interfaces:**

- Consumes: `useContextMenu`, `ContextMenuItem` (Task 3); `useMailActions().thread` (`markDone`, `trash`, `toggleSpam`, `markRead`, nový `markUnread`); `selectKey` zo `features/mail/selection`; remind overlay `setUi({ overlay: { kind: 'remind', threadId, anchor } })` s anchor = bod kliku.
- Produces: `threadMenuItems(view: string, thread: ThreadSummary): ContextMenuItem[]`, kde `view` je výsledok `actionView`. Id: `read`, `unread`, `done`, `remind`, `spam`, `trash`. Mapovanie: default (inbox/tasks/reminders) = toggle, Hotovo, Pripomenúť…, separator, Presunúť do koša; `done` = toggle, Vrátiť do Doručenej pošty, Pripomenúť…, separator, Presunúť do koša; `trash` = toggle, Obnoviť; `spam` = toggle, Nie je spam, separator, Presunúť do koša; `sent` = toggle, separator, Presunúť do koša.

- [ ] **Step 1: Write failing tests** cez `renderApp` (demo klient, BrowserPlatform): pravý klik na neprečítaný riadok vyberie riadok a ukáže položky pre inbox; "Označiť ako prečítané" odstráni `.dot`, opačne "Označiť ako neprečítané"; "Hotovo" zobrazí toast "Hotovo" a riadok zmizne; "Pripomenúť…" otvorí WhenPicker; v Koši je "Obnoviť" a nie je "Presunúť do koša"; pravý klik na riadok v Konceptoch neotvorí menu a `contextmenu` event nie je `defaultPrevented`.
- [ ] **Step 2: Run** `pnpm --filter @relay/desktop test thread-context-menu` → FAIL.
- [ ] **Step 3: Implement** podľa Interfaces.
- [ ] **Step 4: Run** `pnpm --filter @relay/desktop test` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): context menu on thread rows`

### Task 5: Menu priečinkov + migrácia `FolderMenu`

**Files:**

- Create: `apps/desktop/src/renderer/src/features/folders/folder-menu-items.ts`
- Create: `apps/desktop/src/renderer/src/features/folders/use-mark-folder-read.ts`
- Create: `apps/desktop/src/renderer/src/features/folders/use-folder-menu.ts`
- Modify: `SystemFolders.tsx` (menu pre všetky `NAV_VIEWS` okrem `drafts` a `scheduled`), `edit/use-folder-leaves.tsx` (`onMenu` pre každý mailbox a label leaf; edit položky len pre editovateľné), `FolderTreeRows.tsx` (`onMenu` dostane `MouseEvent`)
- Delete: `edit/FolderMenu.tsx`; z `folder-edit-store.ts` odstrániť `kind: 'menu'`; upraviť `edit/FolderEditHost.tsx`
- Test: `apps/desktop/src/renderer/test/folder-context-menu.test.tsx`; upraviť `folder-management.test.tsx` a `custom-folders.test.tsx`, ak otvárajú menu

**Interfaces:**

- Consumes: `useContextMenu` (Task 3), `MailClient.markFolderRead` (Task 2), `listParamsOf` zo `state/folders.ts` (bez `q`), `queryKeys` na invalidáciu zoznamov vlákien a mailboxov, `showToast`.
- Produces: `folderMenuItems(target: FolderTarget | null): ContextMenuItem[]` = `mark-all-read`, a ak `target !== null`: separator, `create` (`FOLDER_COPY[kind].newChild`), `rename` ("Premenovať"), `move` ("Presunúť do…"), `delete` ("Zmazať"). `move` otvorí `FolderMovePicker` s anchor = bod kliku. `useMarkFolderRead(): (folder: Folder) => Promise<void>` posiela scope z `useUiStore`.

- [ ] **Step 1: Write failing tests:** pravý klik na "Doručená pošta" → "Označiť všetko ako prečítané" → v zozname nie je `.unread`, počítadlo zmizne, toast "Označené ako prečítané: N"; druhé spustenie → "Všetko je už prečítané"; so scope jedného účtu ostane druhý účet neprečítaný; Koncepty nemajú menu; IMAP priečinok má mark-all-read + Premenovať/Zmazať a "Premenovať" otvorí rename editor (existujúci flow).
- [ ] **Step 2: Run** `pnpm --filter @relay/desktop test folder-context-menu` → FAIL.
- [ ] **Step 3: Implement** podľa Interfaces.
- [ ] **Step 4: Run** `pnpm --filter @relay/desktop test`, `pnpm lint`, `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): folder context menu with mark all as read`
