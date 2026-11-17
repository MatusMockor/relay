import type { ThreadDetail } from '@relay/shared';
import { Icon } from '@relay/ui';
import { useChecklistToggle } from './use-checklist-toggle';

export function SummaryChecklist({ detail }: { readonly detail: ThreadDetail }) {
  const toggle = useChecklistToggle(detail.thread.id);
  if (detail.checklist.length === 0) {
    return null;
  }
  return (
    <ul>
      {detail.checklist.map((item) => {
        const { done } = item;
        return (
          <li key={item.id}>
            <button
              type="button"
              className={`chk${done ? ' on' : ''}`}
              aria-pressed={done}
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
        );
      })}
    </ul>
  );
}
