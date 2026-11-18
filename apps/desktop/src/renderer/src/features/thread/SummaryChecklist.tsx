import type { ThreadDetail } from '@relay/shared';
import { Icon } from '@relay/ui';
import { useChecklistToggle } from './use-checklist-toggle';

export function SummaryChecklist({ detail }: { readonly detail: ThreadDetail }) {
  const toggle = useChecklistToggle(detail.thread.id);
  if (detail.checklist.length === 0) {
    return null;
  }
  const done = String(detail.checklist.filter((item) => item.done).length);
  const total = String(detail.checklist.length);
  return (
    <>
      <div className="chk-h">
        <span>Ďalšie kroky</span>
        <span className="sr-only">{`Dokončené ${done} z ${total}`}</span>
        <span aria-hidden="true">{`${done}/${total}`}</span>
      </div>
      <ul>
        {detail.checklist.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`chk${item.done ? ' on' : ''}`}
              aria-pressed={item.done}
              onClick={() => {
                void toggle(item);
              }}
            >
              <span className="box">
                <Icon name="check" size={10} strokeWidth={2.6} />
              </span>
              <span className="t">{item.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
