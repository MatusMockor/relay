import { type AnchorRect, FolderIcon, Icon, Popover } from '@relay/ui';
import { type ReactNode, useState } from 'react';
import { isControlTarget } from '../../keyboard/focus-target';
import { FOLDER_COPY } from './folder-copy';
import { type FolderEdit, type FolderTarget, setFolderEdit } from './folder-edit-store';

interface MenuItem {
  readonly label: string;
  readonly icon: ReactNode;
  readonly next: FolderEdit;
}

const itemsOf = (target: FolderTarget, anchor: AnchorRect): MenuItem[] => [
  {
    label: FOLDER_COPY[target.kind].newChild,
    icon: <Icon name="plus" />,
    next: { kind: 'create', accountId: target.mailbox.accountId, parent: target },
  },
  { label: 'Premenovať', icon: <Icon name="pen" />, next: { kind: 'rename', target } },
  {
    label: 'Presunúť do…',
    icon: <FolderIcon name="folder" />,
    next: { kind: 'move', target, anchor },
  },
  { label: 'Zmazať', icon: <Icon name="trash" />, next: { kind: 'delete', target } },
];

export function FolderMenu({
  target,
  anchor,
}: {
  readonly target: FolderTarget;
  readonly anchor: AnchorRect;
}) {
  const items = itemsOf(target, anchor);
  const [cursor, setCursor] = useState(0);
  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setCursor((value) => (value + move + items.length) % items.length);
      return true;
    }
    if (event.key === 'Enter' && !isControlTarget(event.target)) {
      event.preventDefault();
      setFolderEdit(items[cursor]?.next ?? null);
      return true;
    }
    return false;
  };
  return (
    <Popover
      anchor={anchor}
      label={target.name}
      role="menu"
      width={220}
      onClose={() => {
        setFolderEdit(null);
      }}
      onKey={onKey}
    >
      <div className="grp">{target.name}</div>
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          className={`pi${index === cursor ? ' on' : ''}`}
          onMouseMove={() => {
            setCursor(index);
          }}
          onClick={() => {
            setFolderEdit(item.next);
          }}
        >
          <span className="ic">{item.icon}</span>
          <span className="lb">{item.label}</span>
        </button>
      ))}
    </Popover>
  );
}
