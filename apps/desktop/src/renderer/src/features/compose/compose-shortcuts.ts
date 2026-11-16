import type { RecipientKind } from './recipients/compose-recipients';
import type { ComposeAi } from './use-compose-ai';

export interface ComposeShortcutActions {
  readonly send: () => void;
  readonly schedule: () => void;
  readonly reveal: (kind: RecipientKind) => void;
  readonly attach: () => void;
  readonly ai: ComposeAi;
}

const SHIFTED: Readonly<Record<string, (actions: ComposeShortcutActions) => void>> = {
  c: (actions) => {
    actions.reveal('cc');
  },
  b: (actions) => {
    actions.reveal('bcc');
  },
  a: (actions) => {
    actions.attach();
  },
};

export const composeShortcut =
  (actions: ComposeShortcutActions) =>
  (event: KeyboardEvent): boolean => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        actions.schedule();
        return true;
      }
      actions.send();
      return true;
    }
    const shifted = mod && event.shiftKey ? SHIFTED[key] : undefined;
    if (shifted !== undefined) {
      event.preventDefault();
      shifted(actions);
      return true;
    }
    if (mod && key === 'j') {
      event.preventDefault();
      actions.ai.toggle();
      return true;
    }
    if (event.key === 'Escape' && actions.ai.open) {
      event.preventDefault();
      actions.ai.close();
      return true;
    }
    return false;
  };
