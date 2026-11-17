import type { ThreadDetail } from '@relay/shared';
import { Spark } from '@relay/ui';
import { useUserSettings } from '../../data/hooks/use-mail-queries';
import { useThreadSummaryRequest } from '../../data/hooks/use-thread-summary-request';
import { SummaryChecklist } from './SummaryChecklist';
import { SummaryRequestButton } from './SummaryRequestButton';

export interface AiSummaryProps {
  readonly detail: ThreadDetail;
  readonly pending: boolean;
}

export function AiSummary({ detail, pending }: AiSummaryProps) {
  const settings = useUserSettings();
  const summaryRequest = useThreadSummaryRequest(detail.thread);
  const summary = detail.aiSummary ?? detail.thread.aiOneLiner;
  const waiting = (pending || summaryRequest.requesting) && detail.aiSummary === null;
  const offered =
    !waiting && detail.aiSummary === null && settings.data?.ai.features.summaries === true;
  const ask = offered ? <SummaryRequestButton onRequest={summaryRequest.request} /> : null;
  if (summary === null && !waiting) {
    return ask;
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
      {ask}
      <SummaryChecklist detail={detail} />
    </section>
  );
}
