import type { ThreadDetail } from '@relay/shared';
import { hasOpenLayer } from '@relay/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { useSplits, useTasks } from '../../data/hooks/use-mail-queries';
import { undoLast } from '../../state/toast-store';
import { type RightTab, setUi, useUiStore } from '../../state/ui-store';
import { centerRect, rectOf } from '../folders/rect';
import { useMailActions } from '../mail/MailActionsProvider';
import {
  backToList,
  closeSearch,
  moveSelection,
  openRight,
  openSearch,
  selectFolder,
  selectScope,
  toggleRight,
} from '../mail/navigation';
import { useOpenItem } from '../mail/use-open-item';
import { useAccountsModel } from '../mail/use-accounts-model';
import { splitGKey, splitsInScope } from '../shell/SplitTabs';
import { useLayout } from '../shell/use-layout';
import { useStepThread } from '../shell/use-step-thread';
import {
  cycleFolder,
  G_VIEWS,
  isTyping,
  scopeForDigit,
  suggestionAt,
  tabFolders,
} from './key-handlers';
import { isControlTarget } from './focus-target';

const TABS: readonly RightTab[] = ['contact', 'ai', 'calendar'];
const G_WINDOW_MS = 1_500;

export const useKeyboard = (): void => {
  const actions = useMailActions();
  const openItem = useOpenItem();
  const step = useStepThread();
  const model = useAccountsModel();
  const layout = useLayout();
  const queryClient = useQueryClient();
  const scope = useUiStore((state) => state.scope);
  const splits = splitsInScope(useSplits().data ?? [], scope);
  const hasTasks = (useTasks().data?.items ?? []).some((task) => task.state !== 'done');
  const gAt = useRef(0);
  const handler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  handler.current = (event: KeyboardEvent) => {
    if (event.defaultPrevented || hasOpenLayer()) {
      return;
    }
    const ui = useUiStore.getState();
    const mod = event.metaKey || event.ctrlKey;
    const inThread = ui.openThreadId !== null;
    const current = actions.current;
    const thread = current?.kind === 'thread' ? current.thread : null;
    const claim = (run: () => void) => {
      event.preventDefault();
      run();
    };
    if (mod && event.key.toLowerCase() === 'k') {
      claim(() => {
        setUi({ overlay: { kind: 'palette' } });
      });
      return;
    }
    if (mod && event.key === ',') {
      claim(() => {
        setUi({ overlay: { kind: 'settings', section: 'accounts', adding: false } });
      });
      return;
    }
    if (event.altKey && !mod && /^Digit[123]$/.test(event.code)) {
      claim(() => {
        openRight(TABS[Number(event.code.slice(5)) - 1] ?? 'contact');
      });
      return;
    }
    if (mod && !event.altKey && !event.shiftKey && /^Digit[1-9]$/.test(event.code)) {
      const target = scopeForDigit(
        Number(event.code.slice(5)),
        model.accounts.map((account) => account.id),
      );
      if (target !== null) {
        claim(() => {
          selectScope(target);
        });
      }
      return;
    }
    if (isTyping(event.target) || mod || event.altKey) {
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLButtonElement) {
      return;
    }
    if (event.key === 'Tab' && isControlTarget(event.target)) {
      return;
    }
    if (gAt.current > 0 && Date.now() - gAt.current < G_WINDOW_MS) {
      gAt.current = 0;
      const key = event.key.toLowerCase();
      const split = splits.find((item) => splitGKey(item).toLowerCase() === key);
      const folder =
        G_VIEWS[key] ??
        (split === undefined ? undefined : { kind: 'inbox' as const, splitId: split.id });
      if (folder !== undefined) {
        claim(() => {
          selectFolder(folder);
        });
      }
      return;
    }
    gAt.current = 0;
    const detail =
      ui.openThreadId === null
        ? undefined
        : queryClient.getQueryData<ThreadDetail>(queryKeys.thread(ui.openThreadId));
    const move = (delta: number) => {
      if (inThread) {
        step(delta);
        return;
      }
      moveSelection(actions.items, delta);
    };
    const map: Record<string, () => void> = {
      j: () => {
        move(1);
      },
      ArrowDown: () => {
        move(1);
      },
      k: () => {
        move(-1);
      },
      ArrowUp: () => {
        move(-1);
      },
      Enter: () => {
        if (!inThread) {
          openItem(current);
        }
      },
      o: () => {
        if (!inThread) {
          openItem(current);
        }
      },
      Escape: () => {
        if (inThread) {
          backToList();
          return;
        }
        closeSearch();
      },
      e: () => {
        actions.thread.markDone(current);
      },
      h: () => {
        if (thread === null) {
          return;
        }
        const time = document.querySelector(`[data-row="${thread.id}"] time`);
        setUi({
          overlay: {
            kind: 'remind',
            threadId: thread.id,
            anchor: time === null ? centerRect() : rectOf(time),
          },
        });
      },
      r: () => {
        if (thread !== null) {
          actions.compose.startReply(thread.id, thread.accountId);
        }
      },
      R: () => {
        if (thread !== null) {
          actions.compose.replyAll(thread.id);
        }
      },
      f: () => {
        if (thread !== null) {
          actions.compose.forward(thread.id);
        }
      },
      z: undoLast,
      a: () => {
        openRight('ai');
        setTimeout(() => document.getElementById('chat-q')?.focus(), 0);
      },
      '/': openSearch,
      '?': () => {
        setUi({ overlay: { kind: 'shortcuts' } });
      },
      c: () => {
        setUi({ overlay: { kind: 'compose', init: {} } });
      },
      '#': () => {
        actions.thread.trash(current);
      },
      Delete: () => {
        actions.thread.trash(current);
      },
      i: toggleRight,
      '[': () => {
        setUi({ leftUser: !layout.leftVisible });
      },
      g: () => {
        gAt.current = Date.now();
      },
      Tab: () => {
        selectFolder(cycleFolder(tabFolders(splits, hasTasks), ui.folder, event.shiftKey ? -1 : 1));
      },
      '1': () => {
        const text = suggestionAt(detail, 0);
        if (inThread && thread !== null && text !== null) {
          actions.compose.startReply(thread.id, thread.accountId, text);
        }
      },
      '2': () => {
        const text = suggestionAt(detail, 1);
        if (inThread && thread !== null && text !== null) {
          actions.compose.startReply(thread.id, thread.accountId, text);
        }
      },
      '3': () => {
        const text = suggestionAt(detail, 2);
        if (inThread && thread !== null && text !== null) {
          actions.compose.startReply(thread.id, thread.accountId, text);
        }
      },
    };
    const run =
      map[event.key] ?? (event.key.length === 1 ? map[event.key.toLowerCase()] : undefined);
    if (event.key === 'A') {
      claim(map.a ?? (() => undefined));
      return;
    }
    if (run !== undefined) {
      claim(run);
    }
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handler.current(event);
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
    };
  }, []);
};
