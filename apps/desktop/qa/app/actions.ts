import type { Page } from 'playwright';
import { pickMoveTarget, runPaletteCommand, searchMail } from './palette';

export type GoView = 'inbox' | 'done' | 'archive' | 'sent' | 'drafts' | 'spam' | 'trash';

export type QaAction =
  | { readonly kind: 'done' }
  | { readonly kind: 'restore' }
  | { readonly kind: 'trash' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'back' }
  | { readonly kind: 'move'; readonly target: string }
  | { readonly kind: 'moveViaPalette'; readonly target: string }
  | { readonly kind: 'search'; readonly query: string }
  | { readonly kind: 'goto'; readonly view: GoView }
  | { readonly kind: 'palette'; readonly command: string };

type Handler<Kind extends QaAction['kind']> = (
  page: Page,
  action: Extract<QaAction, { kind: Kind }>,
) => Promise<void>;

type Handlers = { readonly [Kind in QaAction['kind']]: Handler<Kind> };

const GO_KEYS: Readonly<Record<GoView, string>> = {
  inbox: 'i',
  done: 'e',
  archive: 'a',
  sent: 't',
  drafts: 'd',
  spam: 'p',
  trash: 'k',
};

const press = (key: string) => async (page: Page) => {
  await page.keyboard.press(key);
};

const handlers: Handlers = {
  done: press('e'),
  restore: press('e'),
  trash: press('#'),
  undo: press('z'),
  back: press('Escape'),
  move: async (page, action) => {
    await page.keyboard.press('v');
    await pickMoveTarget(page, action.target);
  },
  moveViaPalette: async (page, action) => {
    await runPaletteCommand(page, 'Presunúť do…');
    await pickMoveTarget(page, action.target);
  },
  search: (page, action) => searchMail(page, action.query),
  goto: async (page, action) => {
    await page.keyboard.press('g');
    await page.keyboard.press(GO_KEYS[action.view]);
  },
  palette: (page, action) => runPaletteCommand(page, action.command),
};

const blurInputs = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.blur();
    }
  });

export const runAction = async (page: Page, action: QaAction): Promise<void> => {
  await blurInputs(page);
  const handler = handlers[action.kind] as (page: Page, action: QaAction) => Promise<void>;
  await handler(page, action);
};
