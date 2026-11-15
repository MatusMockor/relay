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
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') {
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
        <button type="button" className="btn pri" onClick={onConfirm} autoFocus>
          {confirmLabel} <Kbd keys={['↵']} />
        </button>
      </div>
    </Sheet>
  );
}
