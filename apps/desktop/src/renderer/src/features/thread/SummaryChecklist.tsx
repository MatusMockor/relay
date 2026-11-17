import type { ThreadDetail } from '@relay/shared';
import { Icon } from '@relay/ui';
import { useChecklistToggle } from './use-checklist-toggle';

export function SummaryChecklist({ detail }: { readonly detail: ThreadDetail }) {
  const toggle = useChecklistToggle(detail.thread.id);
  if (detail.checklist.length === 0) {
    return null;
  }
  const done = detail.checklist.filter((item) => item.done).length;
  return (
    <>
      <div className="chk-h" aria-hidden="true">
        <span>Ďalšie kroky</span>
        <span>{`${String(done)}/${String(detail.checklist.length)}`}</span>
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
