import { PreviewSampleList } from '../automations/PreviewSampleList';
import { countLabel, previewErrorLabel } from '../automations/RulePreview';
import type { SplitDraft } from './split-draft';
import { overlapLine } from './split-overlaps';
import { useSplitDraftPreview } from './use-split-draft-preview';

export function SplitPreview({ draft }: { readonly draft: SplitDraft }) {
  const { enabled, invalid, waiting, query } = useSplitDraftPreview(draft);
  if (!enabled) {
    return null;
  }
  if (invalid) {
    return (
      <section className="au-prev" aria-label="Náhľad splitu">
        <p className="au-prev-h">Náhľad sa nedá spočítať. Split môže mať najviac 20 výnimiek.</p>
      </section>
    );
  }
  const { data } = query;
  const busy = waiting || query.isFetching;
  return (
    <section className="au-prev" aria-label="Náhľad splitu" aria-busy={busy}>
      {data === undefined && query.isError ? (
        <p className="au-prev-h">{previewErrorLabel(query.error)}</p>
      ) : null}
      {data === undefined && !query.isError ? <p className="au-prev-h">Počítam náhľad…</p> : null}
      {data === undefined ? null : (
        <>
          <p className="au-prev-h" aria-live="polite">
            {countLabel(data)}
          </p>
          {data.overlaps.length === 0 ? null : (
            <ul className="sp-overlaps" aria-label="Prekryv s inými pravidlami">
              {data.overlaps.map((overlap) => (
                <li key={`${overlap.kind}-${overlap.id}`}>{overlapLine(overlap)}</li>
              ))}
            </ul>
          )}
          <PreviewSampleList samples={data.samples} />
        </>
      )}
    </section>
  );
}
