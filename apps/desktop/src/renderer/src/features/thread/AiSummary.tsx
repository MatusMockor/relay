import type { ThreadDetail } from '@relay/shared';
import { Icon, Spark } from '@relay/ui';
import { useChecklistToggle } from './use-checklist-toggle';

export interface AiSummaryProps {
  readonly detail: ThreadDetail;
  readonly pending: boolean;
}

export function AiSummary({ detail, pending }: AiSummaryProps) {
  const toggle = useChecklistToggle(detail.thread.id);
  const summary = detail.aiSummary ?? detail.thread.aiOneLiner;
  const waiting = pending && detail.aiSummary === null;
  if (summary === null && !waiting) {
    return null;
  }
  return (
    <section
      className={waiting && summary === null ? 't-sum wait' : 't-sum'}
      aria-label="Zhrnutie"
      aria-busy={waiting}
    >
      <span className="h">
        <Spark />
        Zhrnutie
      </span>
      {summary === null ? null : <p>{summary}</p>}
      {waiting ? (
        <p className="sum-wait">
          <i className="wait-dot" />
          {summary === null ? 'AI pripravuje zhrnutie…' : 'AI dopĺňa podrobnosti…'}
        </p>
      ) : null}
      {detail.checklist.length === 0 ? null : (
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
      )}
    </section>
  );
}
