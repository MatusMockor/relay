import type { AutomationPreviewResponse } from '@relay/shared';
import { MailClientError } from '../../../data/errors';
import { plural } from '../../../lib/text';
import { PreviewSampleList } from './PreviewSampleList';
import { useRulePreview } from './use-rule-preview';
import type { RuleInput } from './editable-rule';

const countLabel = ({ count, days, truncated }: AutomationPreviewResponse): string =>
  `Zachytí ${truncated ? 'aspoň ' : ''}${String(count)} ${plural(count, 'mail', 'maily', 'mailov')} za posledných ${String(days)} dní`;

export const previewErrorLabel = (error: unknown): string =>
  error instanceof MailClientError && error.code === 'not_implemented'
    ? error.message
    : 'Náhľad sa nepodarilo načítať.';

export function RulePreview({ input }: { readonly input: RuleInput }) {
  const { enabled, invalid, waiting, query } = useRulePreview(input);
  if (!enabled) {
    return null;
  }
  if (invalid) {
    return (
      <section className="au-prev" aria-label="Náhľad pravidla">
        <p className="au-prev-h">
          Náhľad sa nedá spočítať. Pravidlo môže mať najviac 20 podmienok a 20 výnimiek.
        </p>
      </section>
    );
  }
  const { data } = query;
  const busy = waiting || query.isFetching;
  return (
    <section className="au-prev" aria-label="Náhľad pravidla" aria-busy={busy}>
      {data === undefined && query.isError ? (
        <p className="au-prev-h">{previewErrorLabel(query.error)}</p>
      ) : null}
      {data === undefined && !query.isError ? <p className="au-prev-h">Počítam náhľad…</p> : null}
      {data === undefined ? null : (
        <>
          <p className="au-prev-h" aria-live="polite">
            {countLabel(data)}
          </p>
          <PreviewSampleList samples={data.samples} />
        </>
      )}
    </section>
  );
}
