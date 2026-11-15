import { useRef } from 'react';
import { Kbd } from './Kbd';
import { Sheet } from './Overlay';

export interface ConfirmDialogProps {
  readonly title: string;
  readonly text: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  cancelLabel = 'Zrušiť',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmButton = useRef<HTMLButtonElement>(null);
  const onKey = (event: KeyboardEvent) => {
    const otherButton =
      event.target instanceof HTMLButtonElement && event.target !== confirmButton.current;
    if (event.key !== 'Enter' || otherButton) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    onConfirm();
    return true;
  };
  return (
    <Sheet label={title} role="alertdialog" className="cf" onClose={onCancel} onKey={onKey}>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="btns">
        <button type="button" className="btn" onClick={onCancel}>
          {cancelLabel} <Kbd keys={['Esc']} />
        </button>
        <button ref={confirmButton} type="button" className="btn pri" onClick={onConfirm} autoFocus>
          {confirmLabel} <Kbd keys={['↵']} />
        </button>
      </div>
    </Sheet>
  );
}
