import type { AutomationPreviewResponse } from '@relay/shared';
import { useState } from 'react';
import { plural } from '../../lib/text';
import type { RuleInput } from '../settings/automations/editable-rule';
import { PreviewSampleList } from '../settings/automations/PreviewSampleList';
import { previewErrorLabel } from '../settings/automations/RulePreview';
import { useRulePreview } from '../settings/automations/use-rule-preview';

const countLabel = ({ count, days, truncated }: AutomationPreviewResponse): string =>
  `${truncated ? 'Aspoň ' : ''}${String(count)} ${plural(count, 'mail', 'maily', 'mailov')} za ${String(days)} dní by to zachytilo`;

export function MailRulePreview({ input }: { readonly input: RuleInput }) {
  const { enabled, waiting, query } = useRulePreview(input);
  const [open, setOpen] = useState(false);
  if (!enabled) {
    return null;
  }
  const { data } = query;
  if (data === undefined) {
    return (
      <section className="au-prev rfm-prev" aria-label="Náhľad pravidla" aria-busy={!query.isError}>
        <p className="au-prev-h">
          {query.isError ? previewErrorLabel(query.error) : 'Počítam náhľad…'}
        </p>
      </section>
    );
  }
  return (
    <section
      className="au-prev rfm-prev"
      aria-label="Náhľad pravidla"
      aria-busy={waiting || query.isFetching}
    >
      <div className="rfm-prev-h">
        <p className="au-prev-h" aria-live="polite">
          {countLabel(data)}
        </p>
        {data.samples.length === 0 ? null : (
          <button
            type="button"
            className="rfm-link"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
          >
            {open ? 'Skryť' : 'Zobraziť'}
          </button>
        )}
      </div>
      {open ? <PreviewSampleList samples={data.samples} /> : null}
    </section>
  );
}
