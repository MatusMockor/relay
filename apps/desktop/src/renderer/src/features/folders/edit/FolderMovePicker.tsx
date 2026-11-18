import { type AnchorRect, FolderIcon, Popover } from '@relay/ui';
import { useState } from 'react';
import { useMailboxes } from '../../../data/hooks/use-mail-queries';
import { isControlTarget } from '../../keyboard/focus-target';
import { type FolderDestination, folderDestinations } from './folder-destinations';
import { type FolderTarget, setFolderEdit } from './folder-edit-store';
import { useFolderActions } from './use-folder-actions';

export function FolderMovePicker({
  target,
  anchor,
}: {
  readonly target: FolderTarget;
  readonly anchor: AnchorRect;
}) {
  const mailboxes = useMailboxes(target.mailbox.accountId);
  const actions = useFolderActions();
  const destinations = folderDestinations(target, mailboxes.data ?? []);
  const [cursor, setCursor] = useState(0);
  const close = () => {
    setFolderEdit(null);
  };
  const pick = (destination: FolderDestination | undefined) => {
    if (destination === undefined) {
      return;
    }
    close();
    void actions.move(target, destination.parentId);
  };
  const onKey = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    const move = moves[event.key];
    if (move !== undefined && destinations.length > 0) {
      event.preventDefault();
      setCursor((value) => (value + move + destinations.length) % destinations.length);
      return true;
    }
    if (event.key === 'Enter' && !isControlTarget(event.target)) {
      event.preventDefault();
      pick(destinations[cursor]);
      return true;
    }
    return false;
  };
  return (
    <Popover
      anchor={anchor}
      label={`Presunúť ${target.name}`}
      role="menu"
      width={260}
      onClose={close}
      onKey={onKey}
    >
      <div className="grp">Presunúť do…</div>
      {destinations.map((destination, index) => (
        <button
          key={destination.parentId ?? 'top'}
          type="button"
          role="menuitem"
          className={`pi${index === cursor ? ' on' : ''}`}
          onMouseMove={() => {
            setCursor(index);
          }}
          onClick={() => {
            pick(destination);
          }}
        >
          <span className="ic">
            <FolderIcon name={target.kind === 'label' ? 'label' : 'folder'} />
          </span>
          <span className="lb">{destination.label}</span>
        </button>
      ))}
      {destinations.length === 0 ? <div className="pal-empty">Žiadne priečinky</div> : null}
    </Popover>
  );
}
