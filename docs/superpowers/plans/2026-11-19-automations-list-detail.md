# Automatizácie: zoznam, detail a šablóny - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the always-expanded automation cards in Settings > Automatizácie with a compact list, a drill-in detail form and a template picker for new rules.

**Architecture:** Renderer-only change in `apps/desktop/src/renderer`. `AutomationsSection` becomes a small view router (`list` | `detail` | `templates`) on top of the existing `useAutomationEditor` (extended with `reorder` and `addFrom`). Persistence stays autosave via `useReplaceAutomations`. Pure helpers (summary text, templates, reorder, AI detection) live in their own `.ts` files and are unit tested; views are tested through `renderApp` + `demoClient`.

**Tech Stack:** React 19, TanStack Query, Zustand, `@relay/ui`, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-19-automations-list-detail-design.md`

## Global Constraints

- No change to `packages/*`, server, engine, IPC or data model.
- Files < 150 lines (hard limit 300), one responsibility per file, no `else`/`else if`, no code comments, no `any`, no `throw` in tests.
- All UI copy Slovak with diacritics; never use the characters "—" or "–", use "-".
- Native HTML5 drag and drop, no new dependency.
- Autosave unchanged: a rule without conditions is not persisted and shows "Pridaj aspoň jednu podmienku, potom sa pravidlo uloží."
- Keep: `scopeChange` on account change, account step before move/label when rule is for all accounts, multiple `addLabel` allowed, single `moveTo`, at least one action, "Obnoviť predvolené Jira pravidlo".
- Verify with `pnpm --filter @relay/desktop lint`, `typecheck`, `test`. No production build.

## Review Focus

- Unchecking the last checked action: must be refused (checkbox stays checked, rule unchanged).
- Picking a template that needs a value (newsletter domain, sender address): detail opens as an unsaved draft with the empty field focused/visible; nothing persists until the condition is valid.
- Dragging a rule while a save is pending (`editor.saving`): drag is disabled, order does not change.
- A draft (unsaved) rule in the list: it shows in the list, cannot be dragged, opening it shows the hint.
- Going back from detail of a draft without a condition: the draft stays in the list as unsaved (current behavior), it is not silently persisted or lost.

---

### Task 1: Pure helpers

**Files:**

- Create: `apps/desktop/src/renderer/src/features/settings/automations/rule-summary.ts`
- Create: `apps/desktop/src/renderer/src/features/settings/automations/rule-templates.ts`
- Create: `apps/desktop/src/renderer/src/features/settings/automations/rule-order.ts`
- Modify: `apps/desktop/src/renderer/src/features/settings/automations/automation-labels.ts` (add `AI_ACTIONS`)
- Test: `apps/desktop/src/renderer/test/automation-helpers.test.ts`

**Interfaces:**

- Produces:
  - `summarizeConditions(conditions: readonly AutomationCondition[]): string` - `describeCondition` joined with `" a "`, first letter uppercased; `""` for none.
  - `summarizeActions(actions: readonly AutomationAction[], targets: ActionTargets): string` - `describeAction(...).label` joined with `", "`.
  - `usesAi(actions: readonly AutomationAction[]): boolean` - true when any action type is in `AI_ACTIONS = ['summary', 'task']`.
  - `interface RuleTemplate { readonly id: 'jira' | 'newsletter' | 'sender' | 'attachments' | 'blank'; readonly title: string; readonly description: string; readonly name: string; readonly conditions: AutomationCondition[]; readonly actions: AutomationAction[]; }` and `RULE_TEMPLATES: readonly RuleTemplate[]` in this order with this copy:
    - jira: "Úlohy z Jiry" / "Keď ťa v Jire priradia alebo spomenú, vytvorí úlohu." / name "Úlohy z Jiry" / conditions `[{type:'jira', projectKeys:[]}, {type:'jiraEvent', kind:'assigned'}]` / actions `[{type:'task'}]`
    - newsletter: "Upratať newslettre" / "Maily z vybranej domény označí ako prečítané a archivuje." / name "Newslettre" / conditions `[]` / actions `[{type:'markRead'},{type:'archive'}]` / `needs: 'fromDomain'`
    - sender: "Dôležitý odosielateľ" / "Maily od konkrétnej osoby pripne a pošle notifikáciu." / name "Dôležitý odosielateľ" / conditions `[]` / actions `[{type:'pin'},{type:'notify'}]` / `needs: 'fromAddress'`
    - attachments: "Faktúry s prílohou" / "Maily s prílohou a slovom faktúra v predmete pripne, aby ti neušli." / name "Faktúry" / conditions `[{type:'subjectRegex', pattern:'faktúra|faktura'}, {type:'hasAttachment'}]` (match the real `hasAttachment` schema shape) / actions `[{type:'pin'}]` / `needs: null`
    - blank: "Prázdne pravidlo" / "Podmienky aj akcie si nastavíš sám." / name "Nové pravidlo" / conditions `[]` / actions `[{type:'task'}]`
    - Add `readonly needs: AutomationConditionType | null` to the interface (null for jira, blank).
  - `moveRule<T>(items: readonly T[], from: number, to: number): T[]` - returns new array with item moved; out-of-range or equal indexes return a copy unchanged.

- [ ] **Step 1: Write failing tests** in `automation-helpers.test.ts`: `summarizeConditions` of `[{type:'jira',projectKeys:[]},{type:'jiraEvent',kind:'assigned'}]` equals `"Z Jiry a Jira udalosť je Priradenie"`; `summarizeConditions([])` equals `""`; `usesAi([{type:'archive'}])` false, `usesAi([{type:'pin'},{type:'summary'}])` true; `RULE_TEMPLATES.map(t => t.id)` equals `['jira','newsletter','sender','attachments','blank']`; every template's actions parse with `AutomationActionsSchema`; `moveRule(['a','b','c'], 0, 2)` equals `['b','c','a']`, `moveRule(['a','b'], 0, 5)` equals `['a','b']`.
- [ ] **Step 2:** Run `pnpm --filter @relay/desktop exec vitest run test/automation-helpers.test.ts` - expect FAIL (modules missing).
- [ ] **Step 3:** Implement the three files and `AI_ACTIONS`.
- [ ] **Step 4:** Re-run - expect PASS.
- [ ] **Step 5:** Commit `feat(desktop): add automation summary, template and order helpers`.

### Task 2: Editor hook - reorder and templates

**Files:**

- Modify: `apps/desktop/src/renderer/src/features/settings/automations/use-automation-editor.ts`
- Modify: `apps/desktop/src/renderer/src/features/settings/automations/editable-rule.ts` (`newRule` accepts an optional template)

**Interfaces:**

- Consumes: `RuleTemplate`, `moveRule` (Task 1).
- Produces on `AutomationEditor`:
  - `reorder(from: number, to: number): void` - only over saved rules; ignored while `saving` or when any index points at a draft; persists all saved inputs with `order` renumbered `0..n-1` in the new sequence.
  - `addFrom(template: RuleTemplate, runner: AiRunnerKind): string` - creates the draft from the template (name, conditions, actions), sets `editing` to its key, returns the key. If the template's conditions are non-empty the draft is complete and is persisted immediately (same path as `change`).
  - existing `add(runner)` removed in favor of `addFrom(blank)`.
- Keep `editableOf`, `scopeChange`, `isComplete` signatures.
- If the hook passes 150 lines, extract `persist` into `use-persist-automations.ts`.

- [ ] **Step 1:** Covered by UI tests in Tasks 3 and 5 (reorder persists order, Jira template persists, newsletter template stays draft). Implement.
- [ ] **Step 2:** `pnpm --filter @relay/desktop typecheck` - expect PASS.
- [ ] **Step 3:** Commit together with Task 3.

### Task 3: List view

**Files:**

- Create: `.../automations/AutomationList.tsx` (list container, drag state)
- Create: `.../automations/AutomationRow.tsx`
- Create: `.../automations/use-row-drag.ts` (HTML5 drag handlers + Alt+ArrowUp/ArrowDown keyboard move)
- Modify: `.../sections/AutomationsSection.tsx` (view router: `type View = { kind: 'list' } | { kind: 'detail'; key: string } | { kind: 'templates' }`, held in `useState`)
- Modify: `apps/desktop/src/renderer/src/styles/automations.css`
- Test: rewrite `apps/desktop/src/renderer/test/automations-section.test.tsx`

**Interfaces:**

- `AutomationRow` props: `rule: EditableRule`, `accounts`, `index`, `disabled`, `onOpen(): void`, `onToggle(enabled: boolean): void`, drag props from `use-row-drag`.
- Row DOM contract (tests rely on it): `role="listitem"` with `aria-label="Pravidlo {name}"`; open button `aria-label="Otvoriť pravidlo {name}"` containing name and summary `"{summarizeConditions} → {summarizeActions}"`; account chip text = account displayName or "Všetky účty"; `Switch` label `"Pravidlo {name} zapnuté"`; drag handle `aria-label="Presunúť pravidlo {name}"` (`draggable`, Alt+Arrow keys move); badges "Predvolené" and "Cieľ neexistuje"; list `role="list"` `aria-label="Pravidlá"`.
- Header keeps `SectionHeader` copy shortened to "Keď príde mail, ktorý spĺňa podmienky, Relay spraví zvolené akcie." and the "+ Nové pravidlo" button opens `templates` view. "Obnoviť predvolené Jira pravidlo" and the sync `SettingRow` stay under the list.

- [ ] **Step 1: Write failing tests:**
  - `lists every rule as one row with a readable summary` - row "Pravidlo Jira spomenutia" contains "Jira udalosť je Spomenutie a projekt je ECOM → AI zhrnutie, Vytvoriť úlohu" and chip "eFabrica"; row "Jira tasky" has "Predvolené".
  - `toggles a rule from the list` - click switch "Pravidlo Tibor zapnuté", `settle()`, stored Tibor `enabled === false`.
  - `reorders rules with the keyboard` - focus handle "Presunúť pravidlo Tibor", `keyDown Alt+ArrowUp`, settle, stored orders reflect Tibor moved one up and orders are `0..n-1` contiguous.
- [ ] **Step 2:** Run the file - expect FAIL.
- [ ] **Step 3:** Implement list, row, drag hook, router.
- [ ] **Step 4:** Run - expect PASS.
- [ ] **Step 5:** Commit `feat(desktop): show automations as a sortable list`.

### Task 4: Detail view

**Files:**

- Create: `.../automations/AutomationDetail.tsx` (header + three sections + footer)
- Create: `.../automations/WhenSection.tsx` (account select + condition rows)
- Create: `.../automations/ConditionRow.tsx` (inline editor for one condition, reuses `condition-draft.ts`; commits via `conditionOf` when valid, shows "Doplň podmienku správne." when not)
- Create: `.../automations/ActionChecklist.tsx` (checkbox grid; move/label rows open existing `MailboxActionPicker` / `LabelActionPicker` inside `TokenPopover`, with the account step when `accountId === null`)
- Create: `.../automations/AiSection.tsx` (rendered only when `usesAi(actions)`; reuses `InstructionsBox`, `ModelPicker`; lead text `„{prvá AI akcia}“ používa AI. Nastavenie je voliteľné.`)
- Delete when unused: `AutomationCard.tsx`, `RuleSentence.tsx`, `ActionTokens.tsx`, `ConditionTokens.tsx`, `ActionMenu.tsx` (reuse their logic where possible, e.g. `action-choices.ts`), remove dead CSS.
- Test: `automations-section.test.tsx`, `automation-filters.test.tsx`, `automations-default-rule.test.tsx` rewritten to the new UI.

**Interfaces:**

- Detail DOM contract: `role="region"` `aria-label="Pravidlo {name}"`; back button "Späť na automatizácie" (text "‹ Automatizácie"); `RuleName` for rename; switch as in the row; section headings "Kedy", "Čo spraviť", "AI"; account `select` labelled "Účet" with option "Všetky účty" + account displayNames; condition rows labelled "Podmienka {n}" with remove button "Odstrániť podmienku {describeCondition}"; button "+ Pridať podmienku"; action checkboxes `role="checkbox"` named by `ACTION_LABELS` / move label / "Pridať štítok"; footer `ApplyToExisting` (saved rules only) and button "Odstrániť pravidlo"; hints from today's card kept.
- Unchecking the last action is a no-op.

- [ ] **Step 1: Write failing tests** (port every behavior of the current tests to the new UI):
  - `adds a condition and an action in the detail` (was: through popovers)
  - `changes the provider and the model and edits the instructions`
  - `hides the AI section when no action uses AI` - open Tibor, uncheck AI actions until only a non-AI action remains (check "Archivovať" first), "AI" heading absent.
  - `keeps the last action checked`
  - `deletes a rule` from the detail footer, back on the list without the row.
  - `scopes the default Jira rule to one account` via the "Účet" select.
  - `keeps a new rule unsaved until it has a condition` (via template "Prázdne pravidlo").
  - `adds recipient and attachment conditions`
  - automation-filters: names folder and label, moves into a folder picked from account folders, asks all-accounts rule for an account before a Gmail label, Gmail phrasing, broken target warning (row badge + detail hint), apply to existing inbox mail.
  - default-rule: remove via "Odstrániť pravidlo" and restore via "Obnoviť predvolené Jira pravidlo".
- [ ] **Step 2:** Run the three files - expect FAIL.
- [ ] **Step 3:** Implement detail components, delete dead ones.
- [ ] **Step 4:** Run - expect PASS.
- [ ] **Step 5:** Commit `feat(desktop): edit automations in a detail form`.

### Task 5: Templates view

**Files:**

- Create: `.../automations/RuleTemplates.tsx`
- Test: `automations-section.test.tsx`

**Interfaces:**

- Consumes `RULE_TEMPLATES`, `editor.addFrom` (Tasks 1-2). Each template is a button `aria-label="Šablóna {title}"`; back button "Späť na automatizácie". Picking opens the detail of the returned key. When `needs !== null`, the detail starts with an empty condition row of that type open for input.

- [ ] **Step 1: Write failing tests:**
  - `creates a Jira rule from the template` - "+ Nové pravidlo", "Šablóna Úlohy z Jiry", settle, stored "Úlohy z Jiry" has conditions jira+jiraEvent assigned and actions `[{type:'task'}]`, detail region "Pravidlo Úlohy z Jiry" shown.
  - `asks for the domain before saving a newsletter rule` - pick "Šablóna Upratať newslettre", nothing stored named "Newslettre", type `substack.com` into the domain input of "Podmienka 1", commit, settle, stored conditions `[{type:'fromDomain', domain:'substack.com'}]`, actions markRead+archive.
- [ ] **Step 2:** Run - FAIL. **Step 3:** Implement. **Step 4:** Run - PASS.
- [ ] **Step 5:** Commit `feat(desktop): start new automations from templates`.

### Task 6: Final verification

- [ ] `pnpm --filter @relay/desktop lint && pnpm --filter @relay/desktop typecheck && pnpm --filter @relay/desktop test` - all green.
- [ ] `grep -rn "—\|–" apps/desktop/src/renderer/src/features/settings/automations` - no hits.
- [ ] `wc -l` on new files - all < 150.
- [ ] `pnpm format`, commit `style: format`.
