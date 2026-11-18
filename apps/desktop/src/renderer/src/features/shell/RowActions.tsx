import type { FolderView } from '@relay/shared';
import { FolderIcon, Icon, type StrokeIconName } from '@relay/ui';
import type { MouseEvent } from 'react';
import { viewOf } from '../../state/folders';
import { setUi, useUiStore } from '../../state/ui-store';
import { rectOf } from '../folders/rect';
import type { ListItem } from '../mail/list-items';
import { useMailActions } from '../mail/MailActionsProvider';

interface ActionSpec {
  readonly id: 'done' | 'remind' | 'reply' | 'move' | 'labels' | 'spam' | 'trash';
  readonly icon: StrokeIconName | 'folder' | 'label';
  readonly label: string;
  readonly key: string;
}

const DONE: ActionSpec = { id: 'done', icon: 'check', label: 'Hotovo', key: 'E' };
const REMIND: ActionSpec = { id: 'remind', icon: 'clock', label: 'Pripomenúť', key: 'H' };
const REPLY: ActionSpec = { id: 'reply', icon: 'reply', label: 'Odpovedať', key: 'R' };
const MOVE: ActionSpec = { id: 'move', icon: 'folder', label: 'Presunúť do…', key: 'V' };
const LABELS: ActionSpec = { id: 'labels', icon: 'label', label: 'Štítok…', key: 'L' };
const TRASH: ActionSpec = { id: 'trash', icon: 'trash', label: 'Do koša', key: '#' };
const SPAM: ActionSpec = { id: 'spam', icon: 'spam', label: 'Nahlásiť spam', key: '!' };

const HELD_VIEWS: readonly FolderView[] = ['trash', 'spam'];
const MIXED_VIEWS: readonly FolderView[] = ['mailbox', 'label'];

export const actionView = (view: FolderView, item: ListItem): string => {
  if (item.kind !== 'thread') {
    return view;
  }
  if (MIXED_VIEWS.includes(view)) {
    return item.thread.state;
  }
  return HELD_VIEWS.includes(view) && item.thread.state !== view ? item.thread.state : view;
};

const specsFor = (view: string, inRow: boolean): ActionSpec[] => {
  const map: Record<string, ActionSpec[]> = {
    done: [{ ...DONE, icon: 'inbox', label: 'Vrátiť do Doručenej pošty' }, REPLY, MOVE],
    trash: [{ ...DONE, icon: 'inbox', label: 'Obnoviť' }],
    spam: [{ ...SPAM, icon: 'inbox', label: 'Nie je spam' }, TRASH],
    sent: [REPLY, TRASH],
    drafts: [{ ...TRASH, label: 'Zahodiť koncept' }],
    scheduled: [{ ...TRASH, icon: 'draft', label: 'Zrušiť plán, presunúť do Konceptov' }],
  };
  return (
    map[view] ??
    (inRow ? [DONE, REMIND, REPLY, MOVE] : [DONE, REMIND, REPLY, MOVE, LABELS, SPAM, TRASH])
  );
};

export const rowActionLabels = (view: FolderView, item: ListItem, inRow: boolean): string[] =>
  specsFor(actionView(view, item), inRow).map((spec) => spec.label);

export function RowActions({ item, inRow }: { readonly item: ListItem; readonly inRow: boolean }) {
  const folder = useUiStore((state) => state.folder);
  const actions = useMailActions();
  const run = (spec: ActionSpec, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (spec.id === 'done') {
      actions.thread.markDone(item);
      return;
    }
    if (spec.id === 'trash') {
      actions.thread.trash(item);
      return;
    }
    if (spec.id === 'spam') {
      actions.thread.toggleSpam(item);
      return;
    }
    if (item.kind !== 'thread') {
      return;
    }
    if (spec.id === 'move' || spec.id === 'labels') {
      setUi({ overlay: { kind: spec.id, threadId: item.thread.id } });
      return;
    }
    if (spec.id === 'remind') {
      setUi({
        overlay: { kind: 'remind', threadId: item.thread.id, anchor: rectOf(event.currentTarget) },
      });
      return;
    }
    actions.compose.startReply(item.thread.id, item.thread.accountId);
  };
  return (
    <>
      {specsFor(actionView(viewOf(folder), item), inRow).map((spec) => (
        <button
          key={spec.id}
          type="button"
          className="act"
          title={`${spec.label} (${spec.key})`}
          aria-label={spec.label}
          data-action={spec.id}
          onClick={(event) => {
            run(spec, event);
          }}
        >
          {spec.icon === 'folder' || spec.icon === 'label' ? (
            <FolderIcon name={spec.icon} />
          ) : (
            <Icon name={spec.icon} />
          )}
        </button>
      ))}
    </>
  );
}
